"""Tests on small hand-made data. No database needed: pytest analysis"""

import numpy as np
import pandas as pd
import pytest

import coverage_analysis as cv

T0 = pd.Timestamp("2026-09-28 06:00", tz="UTC")  # a Monday


def article(cluster, source, kind="newspaper", country="IN", minutes=None, category="politics"):
    reported = None if minutes is None else T0 + pd.Timedelta(minutes=minutes)
    return {
        "article_id": f"{cluster}-{source}",
        "cluster_id": cluster,
        "source_id": source,
        "source_name": source,
        "source_kind": kind,
        "source_country": country,
        "category": category,
        "reported_at": reported,
        "time_quality": "ok" if reported is not None else "missing",
    }


def facts(rows):
    # add the cluster columns the SQL views would add
    df = pd.DataFrame(rows)
    df["reported_at"] = pd.to_datetime(df.reported_at, utc=True)
    g = df.groupby("cluster_id")
    df["cluster_sources"] = g.source_id.transform("nunique")
    df["cluster_timed_sources"] = df.cluster_id.map(
        df[df.reported_at.notna()].groupby("cluster_id").source_id.nunique()
    ).fillna(0).astype(int)
    df["cluster_has_wire"] = g.source_kind.transform(lambda s: (s == "wire").any())
    first = g.reported_at.transform("min")
    df["cluster_first_wire_reported_at"] = (
        df.reported_at.where(df.source_kind == "wire").groupby(df.cluster_id).transform("min")
    )
    df["reported_first"] = (df.reported_at == first).where(df.reported_at.notna()).astype("boolean")
    df["lag_minutes"] = (df.reported_at - first).dt.total_seconds() / 60
    return df


def test_wilson_matches_published_values():
    lo, hi = cv.wilson_interval(5, 10)
    assert lo == pytest.approx(0.2366, abs=1e-4)
    assert hi == pytest.approx(0.7634, abs=1e-4)
    lo, hi = cv.wilson_interval(0, 10)
    assert lo == pytest.approx(0.0, abs=1e-12)
    assert hi == pytest.approx(0.2775, abs=1e-4)


def test_bootstrap_ci_contains_the_median_and_ignores_nan():
    lo, hi = cv.bootstrap_median_ci([1, 2, 3, 4, 5, np.nan])
    assert lo <= 3 <= hi


def test_speed_ignores_races_run_alone_and_counts_ties_for_everyone():
    df = facts(
        [
            # Contested: A and B tie, C is 30 minutes behind.
            article("s1", "A", minutes=0),
            article("s1", "B", minutes=0),
            article("s1", "C", minutes=30),
            # only A covered it, so no race
            article("s2", "A", minutes=0),
            # B has no time, so not contested either
            article("s3", "A", minutes=0),
            article("s3", "B", minutes=None),
        ]
    )
    out = cv.speed(df, min_sample=1).set_index("source_name")
    assert out.loc["A", "contested"] == 1
    assert out.loc["A", "firsts"] == 1
    assert out.loc["B", "firsts"] == 1
    assert out.loc["C", "firsts"] == 0
    assert out.loc["C", "median_lag_min"] == 30


def test_wire_vs_press_signs_the_head_start_from_the_wire():
    df = facts(
        [
            article("s1", "Wire", kind="wire", minutes=0),
            article("s1", "Paper", minutes=45),
            article("s2", "Wire", kind="wire", minutes=20),
            article("s2", "Paper", minutes=10),
            article("s3", "Paper", minutes=0),  # no wire: not a head-to-head
        ]
    )
    result = cv.wire_vs_press(df)
    assert result["stories"] == 2
    assert result["wire_first"] == 1
    assert result["press_first"] == 1
    assert sorted(result["head_start"].tolist()) == [-10.0, 45.0]


def test_overlap_is_jaccard():
    rows = [article(c, "A") for c in ("1", "2", "3")] + [article(c, "B") for c in ("2", "3", "4")]
    matrix = cv.overlap_matrix(facts(rows), min_articles=1)
    assert matrix.loc["A", "B"] == pytest.approx(2 / 4)
    assert matrix.loc["A", "A"] == pytest.approx(1.0)
    pairs = cv.top_pairs(matrix)
    assert list(pairs.columns) == ["source_a", "source_b", "jaccard"]
    assert len(pairs) == 1


def test_location_quotient():
    # A: 3 sports, 1 politics. B: 0 sports, 4 politics. Corpus: 3/8 sports.
    rows = [article(f"a{i}", "A", category="sports") for i in range(3)]
    rows += [article("a3", "A", category="politics")]
    rows += [article(f"b{i}", "B", category="politics") for i in range(4)]
    result = cv.specialisation(facts(rows), min_sample=1)
    assert result["lq"].loc["A", "sports"] == pytest.approx((3 / 4) / (3 / 8))
    assert result["lq"].loc["B", "sports"] == 0
    assert 0 <= result["cramers_v"] <= 1


def test_rhythm_is_in_ist_not_utc():
    # Monday 20:00 UTC is Tuesday 01:30 in India.
    df = facts([article("s1", "A", minutes=14 * 60)])
    grid = cv.rhythm(df)
    assert grid.loc["Tue", 1] == 1
    assert grid.to_numpy().sum() == 1


def test_database_url_normalisation():
    url = cv._database_url("postgres://u:p@host:6543/db?pgbouncer=true")
    assert url == "postgresql+psycopg2://u:p@host:6543/db"
    url = cv._database_url("postgresql://u:p@host/db?sslmode=require&pgbouncer=true")
    assert url == "postgresql+psycopg2://u:p@host/db?sslmode=require"
