"""Analysis of the Bharat Lens corpus. Reads the analytics.* views into pandas.

Used by report.py, the notebook and the tests.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from scipy.cluster.hierarchy import leaves_list, linkage
from scipy.spatial.distance import squareform

# Same as src/config/insights.ts
MIN_SAMPLE = 10
TIMEZONE = "Asia/Kolkata"
REPO_ROOT = Path(__file__).resolve().parent.parent


# --------------------------------------------------------------------------- #
# Loading
# --------------------------------------------------------------------------- #


@dataclass
class Corpus:
    articles: pd.DataFrame  # analytics.article_facts, one row per article
    clusters: pd.DataFrame  # analytics.cluster_facts, one row per story
    sources: pd.DataFrame  # the sources table, one row per scanned outlet
    since: pd.Timestamp | None
    loaded_at: pd.Timestamp

    @property
    def window_label(self) -> str:
        start = "all time" if self.since is None else self.since.strftime("%Y-%m-%d")
        return f"{start} to {self.loaded_at.strftime('%Y-%m-%d')} (UTC)"


def _database_url(url: str | None) -> str:
    url = url or os.environ.get("DATABASE_URL") or _read_env_local("DATABASE_URL")
    if not url:
        raise SystemExit(
            "DATABASE_URL is not set. Export it, or put it in .env.local at the repo root."
        )
    # sqlalchemy needs the driver in the URL
    url = re.sub(r"^postgres(ql)?://", "postgresql+psycopg2://", url)
    # psycopg2 errors on Supabase's pgbouncer=true param
    url = re.sub(r"([?&])pgbouncer=[^&]*&?", r"\1", url).rstrip("?&")
    return url


def _read_env_local(key: str) -> str | None:
    path = REPO_ROOT / ".env.local"
    if not path.exists():
        return None
    for line in path.read_text().splitlines():
        name, sep, value = line.partition("=")
        if sep and name.strip() == key:
            return value.strip().strip('"').strip("'")
    return None


def load(days: int | None = 30, url: str | None = None) -> Corpus:
    """Load the views. days=None loads everything."""
    from sqlalchemy import create_engine, text

    engine = create_engine(_database_url(url))
    loaded_at = pd.Timestamp.now(tz="UTC")
    since = None if days is None else loaded_at - pd.Timedelta(days=days)
    params = {"since": (since or pd.Timestamp("1970-01-01", tz="UTC")).to_pydatetime()}

    with engine.connect() as conn:
        articles = pd.read_sql(
            text("SELECT * FROM analytics.article_facts WHERE discovered_at >= :since"),
            conn,
            params=params,
        )
        clusters = pd.read_sql(
            text("SELECT * FROM analytics.cluster_facts WHERE first_discovered_at >= :since"),
            conn,
            params=params,
        )
        sources = pd.read_sql(text("SELECT * FROM sources"), conn)
    engine.dispose()
    return Corpus(_typed(articles), clusters, sources, since, loaded_at)


VIEWS_SQL = REPO_ROOT / "drizzle" / "manual" / "0002_analytics_views.sql"


def install_views(url: str | None = None) -> None:
    """(Re)create the analytics views. Safe to run more than once."""
    from sqlalchemy import create_engine

    engine = create_engine(_database_url(url))
    with engine.begin() as conn:
        conn.exec_driver_sql(VIEWS_SQL.read_text())
    engine.dispose()


def _typed(articles: pd.DataFrame) -> pd.DataFrame:
    # nullable bools come back as object columns
    out = articles.copy()
    for col in ("reported_first", "grounded", "cluster_has_wire", "is_baseline"):
        if col in out:
            out[col] = out[col].astype("boolean")
    return out


# --------------------------------------------------------------------------- #
# Statistics helpers
# --------------------------------------------------------------------------- #


def wilson_interval(successes, trials, z: float = 1.96):
    """95% Wilson interval. Better than the normal approximation for small n."""
    k = np.asarray(successes, dtype=float)
    n = np.asarray(trials, dtype=float)
    with np.errstate(invalid="ignore", divide="ignore"):
        p = k / n
        denom = 1 + z**2 / n
        centre = (p + z**2 / (2 * n)) / denom
        half = z * np.sqrt(p * (1 - p) / n + z**2 / (4 * n**2)) / denom
    return centre - half, centre + half


def bootstrap_median_ci(values, n_boot: int = 2000, seed: int = 0) -> tuple[float, float]:
    """Bootstrap 95% CI for the median (delays are too skewed for a normal CI)."""
    v = np.asarray(values, dtype=float)
    v = v[~np.isnan(v)]
    if len(v) == 0:
        return (np.nan, np.nan)
    rng = np.random.default_rng(seed)
    medians = np.median(v[rng.integers(0, len(v), size=(n_boot, len(v)))], axis=1)
    return (float(np.percentile(medians, 2.5)), float(np.percentile(medians, 97.5)))


# --------------------------------------------------------------------------- #
# 1. Data quality
# --------------------------------------------------------------------------- #

TIME_QUALITY_ORDER = ["ok", "missing", "date-only", "future", "stale"]


def data_quality(articles: pd.DataFrame) -> pd.DataFrame:
    """Per source: article count, publish time quality, grounded rate, word count."""
    if articles.empty:
        return pd.DataFrame()
    shares = pd.crosstab(articles.source_name, articles.time_quality, normalize="index")
    shares = shares.reindex(columns=TIME_QUALITY_ORDER, fill_value=0.0)
    g = articles.groupby("source_name")
    out = pd.DataFrame(
        {
            "articles": g.size(),
            "grounded_rate": g.grounded.mean(),
            "median_words": g.word_count.median(),
        }
    ).join(shares.add_prefix("time_"))
    return out.sort_values("time_ok")


# --------------------------------------------------------------------------- #
# 2. Speed
# --------------------------------------------------------------------------- #


def contested(articles: pd.DataFrame) -> pd.DataFrame:
    """Articles in stories that 2+ outlets covered with usable times."""
    return articles[articles.reported_at.notna() & (articles.cluster_timed_sources >= 2)]


def speed(articles: pd.DataFrame, min_sample: int = MIN_SAMPLE) -> pd.DataFrame:
    c = contested(articles)
    if c.empty:
        return pd.DataFrame()
    g = c.groupby(["source_name", "source_kind"])
    out = g.agg(
        contested=("article_id", "size"),
        firsts=("reported_first", lambda s: int(s.fillna(False).sum())),
        median_lag_min=("lag_minutes", "median"),
    ).reset_index()
    out = out[out.contested >= min_sample].copy()
    out["first_rate"] = out.firsts / out.contested
    out["first_rate_lo"], out["first_rate_hi"] = wilson_interval(out.firsts, out.contested)
    cis = {
        name: bootstrap_median_ci(group.lag_minutes)
        for name, group in c.groupby("source_name")
        if name in set(out.source_name)
    }
    out["median_lag_lo"] = out.source_name.map(lambda n: cis[n][0])
    out["median_lag_hi"] = out.source_name.map(lambda n: cis[n][1])
    return out.sort_values("first_rate", ascending=False).reset_index(drop=True)


# --------------------------------------------------------------------------- #
# 3. Wires vs the Indian press
# --------------------------------------------------------------------------- #


def wire_vs_press(articles: pd.DataFrame) -> dict:
    """For stories both a wire and an Indian paper ran: whose first report came
    first? Exact binomial test against 50/50, ties left out. Only covers stories
    the papers picked up at all.
    """
    timed = articles[articles.reported_at.notna()]
    wire = timed[timed.source_kind == "wire"].groupby("cluster_id").reported_at.min()
    press = (
        timed[(timed.source_kind == "newspaper") & (timed.source_country == "IN")]
        .groupby("cluster_id")
        .reported_at.min()
    )
    both = pd.concat({"wire": wire, "press": press}, axis=1).dropna()
    # positive = wire was earlier
    head_start = (both.press - both.wire).dt.total_seconds() / 60
    wire_first = int((head_start > 0).sum())
    press_first = int((head_start < 0).sum())
    decided = wire_first + press_first
    p_value = stats.binomtest(wire_first, decided, 0.5).pvalue if decided else np.nan
    lo, hi = bootstrap_median_ci(head_start)
    return {
        "stories": int(len(both)),
        "wire_first": wire_first,
        "press_first": press_first,
        "ties": int((head_start == 0).sum()),
        "wire_first_rate": wire_first / decided if decided else np.nan,
        "p_value": float(p_value),
        "median_head_start_min": float(head_start.median()) if len(both) else np.nan,
        "median_head_start_ci": (lo, hi),
        "head_start": head_start,
    }


def wire_dependence(articles: pd.DataFrame, min_sample: int = MIN_SAMPLE) -> pd.DataFrame:
    """Per Indian paper: share of articles also on a wire, share nobody else had,
    and how often it published after the wire."""
    press = articles[(articles.source_kind == "newspaper") & (articles.source_country == "IN")]
    if press.empty:
        return pd.DataFrame()
    timed_vs_wire = press[press.reported_at.notna() & press.cluster_first_wire_reported_at.notna()]
    after_wire = (
        (timed_vs_wire.reported_at > timed_vs_wire.cluster_first_wire_reported_at)
        .groupby(timed_vs_wire.source_name)
        .mean()
    )
    g = press.groupby("source_name")
    out = pd.DataFrame(
        {
            "articles": g.size(),
            "wire_share": g.cluster_has_wire.mean(),
            "exclusive_share": g.cluster_sources.apply(lambda s: (s == 1).mean()),
            "after_wire_rate": after_wire,
        }
    )
    return out[out.articles >= min_sample].sort_values("wire_share", ascending=False)


# --------------------------------------------------------------------------- #
# 4. Overlap
# --------------------------------------------------------------------------- #


def overlap_matrix(articles: pd.DataFrame, min_articles: int = MIN_SAMPLE) -> pd.DataFrame:
    """Jaccard similarity between outlets, ordered by hierarchical clustering."""
    pairs = articles[["source_name", "cluster_id"]].drop_duplicates()
    incidence = pd.crosstab(pairs.source_name, pairs.cluster_id).clip(upper=1)
    incidence = incidence[incidence.sum(axis=1) >= min_articles]
    if len(incidence) < 2:
        return pd.DataFrame()
    m = incidence.to_numpy(dtype=float)
    inter = m @ m.T
    sizes = np.diag(inter)
    jaccard = inter / (sizes[:, None] + sizes[None, :] - inter)
    distance = 1 - jaccard
    np.fill_diagonal(distance, 0)
    order = leaves_list(linkage(squareform(distance, checks=False), method="average"))
    names = incidence.index[order]
    return pd.DataFrame(jaccard[np.ix_(order, order)], index=names, columns=names)


def top_pairs(matrix: pd.DataFrame, n: int = 10) -> pd.DataFrame:
    if matrix.empty:
        return pd.DataFrame(columns=["source_a", "source_b", "jaccard"])
    upper = matrix.where(np.triu(np.ones(matrix.shape, dtype=bool), k=1))
    upper = upper.rename_axis(index="source_a", columns="source_b")
    # pandas 3 keeps NaN in stack()
    stacked = upper.stack().dropna().rename("jaccard").reset_index()
    return stacked.sort_values("jaccard", ascending=False).head(n).reset_index(drop=True)


# --------------------------------------------------------------------------- #
# 5. Specialisation
# --------------------------------------------------------------------------- #


def specialisation(articles: pd.DataFrame, min_sample: int = MIN_SAMPLE) -> dict:
    """Chi-square test of outlet vs category, Cramér's V for effect size, and
    location quotients (outlet's share of a category / overall share)."""
    table = pd.crosstab(articles.source_name, articles.category)
    table = table[table.sum(axis=1) >= min_sample]
    if table.shape[0] < 2 or table.shape[1] < 2:
        return {"table": table, "lq": pd.DataFrame(), "top": pd.DataFrame()}
    chi2, p, dof, expected = stats.chi2_contingency(table)
    n = table.to_numpy().sum()
    cramers_v = float(np.sqrt(chi2 / (n * (min(table.shape) - 1))))
    lq = table.div(table.sum(axis=1), axis=0) / (table.sum(axis=0) / n)
    top = (
        lq.stack()
        .rename("lq")
        .to_frame()
        .join(table.stack().rename("articles"))
        .query("articles >= @min_sample")
        .sort_values("lq", ascending=False)
        .reset_index()
    )
    return {
        "table": table,
        "chi2": float(chi2),
        "p_value": float(p),
        "dof": int(dof),
        "cramers_v": cramers_v,
        # chi-square gets unreliable when lots of expected counts are < 5
        "sparse_cell_share": float((expected < 5).mean()),
        "lq": lq,
        "top": top,
    }


# --------------------------------------------------------------------------- #
# 6. Rhythm, reach and scope
# --------------------------------------------------------------------------- #

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def rhythm(articles: pd.DataFrame, tz: str = TIMEZONE) -> pd.DataFrame:
    """Article counts by weekday and hour (local time)."""
    local = articles.reported_at.dropna().dt.tz_convert(tz)
    grid = pd.crosstab(local.dt.dayofweek, local.dt.hour)
    grid = grid.reindex(index=range(7), columns=range(24), fill_value=0)
    grid.index = WEEKDAYS
    return grid


def reach(clusters: pd.DataFrame) -> dict:
    """How many outlets carry each story."""
    if clusters.empty:
        return {"distribution": pd.Series(dtype=float)}
    sizes = clusters.sources.clip(upper=10)
    distribution = sizes.value_counts(normalize=True).sort_index()
    distribution.index = [f"{i}+" if i == 10 else str(i) for i in distribution.index]
    widest = clusters.sort_values("sources", ascending=False).head(10)[
        ["headline", "sources", "category", "scope", "first_reported_at"]
    ]
    return {
        "stories": int(len(clusters)),
        "single_source_share": float((clusters.sources == 1).mean()),
        "three_plus_share": float((clusters.sources >= 3).mean()),
        "mean_sources": float(clusters.sources.mean()),
        "distribution": distribution,
        "widest": widest.reset_index(drop=True),
    }


def scope_trend(clusters: pd.DataFrame, freq: str = "W-MON") -> pd.DataFrame:
    """Share of new stories per scope per week."""
    if clusters.empty:
        return pd.DataFrame()
    period = clusters.first_discovered_at.dt.tz_convert("UTC").dt.tz_localize(None).dt.to_period(freq)
    table = pd.crosstab(period.dt.start_time.dt.date, clusters.scope, normalize="index")
    return table
