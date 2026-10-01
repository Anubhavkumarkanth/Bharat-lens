"""Runs the whole analysis and writes analysis/output/ (FINDINGS.md, charts, CSVs).

    python analysis/report.py                    # last 30 days
    python analysis/report.py --days 0           # all time
    python analysis/report.py --install-views    # create the views first

Needs DATABASE_URL (env or .env.local).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import charts  # noqa: E402
import coverage_analysis as cv  # noqa: E402

OUT = Path(__file__).resolve().parent / "output"


def pct(x: float) -> str:
    return "n/a" if x is None or np.isnan(x) else f"{x:.0%}"


def minutes(x: float) -> str:
    if x is None or np.isnan(x):
        return "n/a"
    return f"{x:.0f} min" if abs(x) < 90 else f"{x / 60:.1f} h"


def p_text(p: float) -> str:
    return "p < 0.001" if p < 0.001 else f"p = {p:.3f}"


def effect_size(v: float) -> str:
    # rough rule of thumb
    return "weak" if v < 0.1 else "moderate" if v < 0.3 else "strong"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=30, help="look-back window; 0 = all time")
    parser.add_argument("--min-sample", type=int, default=cv.MIN_SAMPLE)
    parser.add_argument("--out", type=Path, default=OUT, help="output directory")
    parser.add_argument(
        "--install-views", action="store_true", help="create/update the analytics views first"
    )
    args = parser.parse_args()
    out = args.out

    if args.install_views:
        cv.install_views()

    corpus = cv.load(days=args.days or None)
    if corpus.articles.empty:
        raise SystemExit("No articles in this window. Run the ingest first or try a bigger --days.")

    (out / "charts").mkdir(parents=True, exist_ok=True)
    (out / "tables").mkdir(parents=True, exist_ok=True)

    a, k = corpus.articles, args.min_sample
    results = {
        "quality": cv.data_quality(a),
        "speed": cv.speed(a, k),
        "wire": cv.wire_vs_press(a),
        "dependence": cv.wire_dependence(a, k),
        "overlap": cv.overlap_matrix(a, k),
        "spec": cv.specialisation(a, k),
        "rhythm": cv.rhythm(a),
        "reach": cv.reach(corpus.clusters),
        "trend": cv.scope_trend(corpus.clusters),
    }

    save_tables(results, out)
    save_charts(results, out)
    (out / "FINDINGS.md").write_text(findings(corpus, results, args))
    print(f"Wrote {out}")


def save_tables(r: dict, out: Path) -> None:
    tables = {
        "data_quality": r["quality"],
        "speed": r["speed"],
        "wire_dependence": r["dependence"],
        "overlap_matrix": r["overlap"],
        "category_counts": r["spec"]["table"],
        "location_quotients": r["spec"]["lq"],
        "rhythm_ist": r["rhythm"],
        "scope_share_weekly": r["trend"],
    }
    for name, frame in tables.items():
        if isinstance(frame, pd.DataFrame) and not frame.empty:
            frame.to_csv(out / "tables" / f"{name}.csv")


def save_charts(r: dict, out: Path) -> None:
    figures = {}
    if not r["quality"].empty:
        figures["1_data_quality"] = charts.data_quality_chart(r["quality"])
    if not r["speed"].empty:
        figures["2_speed"] = charts.speed_chart(r["speed"])
    if r["wire"]["stories"]:
        figures["3_wire_head_start"] = charts.head_start_chart(r["wire"]["head_start"])
    if not r["dependence"].empty:
        figures["3_wire_dependence"] = charts.wire_dependence_chart(r["dependence"])
    if not r["overlap"].empty:
        figures["4_overlap"] = charts.overlap_heatmap(r["overlap"])
    if not r["spec"]["lq"].empty:
        figures["5_specialisation"] = charts.specialisation_heatmap(r["spec"]["lq"])
    if r["rhythm"].to_numpy().sum():
        figures["6_rhythm"] = charts.rhythm_heatmap(r["rhythm"])
    if len(r["reach"]["distribution"]):
        figures["7_reach"] = charts.reach_chart(r["reach"]["distribution"])
    if not r["trend"].empty:
        figures["8_scope_trend"] = charts.scope_trend_chart(r["trend"])
    for name, fig in figures.items():
        fig.savefig(out / "charts" / f"{name}.png", dpi=160, bbox_inches="tight")
        charts.plt.close(fig)


def findings(corpus: cv.Corpus, r: dict, args) -> str:
    a = corpus.articles
    usable = (a.time_quality == "ok").mean()
    # count stories from articles in the window, the same way /insights does
    stories = a.drop_duplicates("cluster_id")
    shared = (stories.cluster_sources >= 2).mean()
    lines = [
        "# Findings",
        "",
        f"Data from {corpus.window_label}. Generated with `python analysis/report.py --days {args.days}`.",
        "",
        "| | |",
        "| --- | --- |",
        f"| Articles | {len(a):,} |",
        f"| Stories | {len(stories):,} |",
        f"| Outlets | {a.source_id.nunique()} |",
        f"| Stories with 2+ outlets | {pct(shared)} |",
        f"| Articles with a usable publish time | {pct(usable)} |",
        "",
    ]

    # 1. Data quality
    q = r["quality"]
    lines += ["## Publish times", ""]
    worst = q.head(3)
    lines.append(
        f"{pct(usable)} of articles have a publish time I can use. The rest are missing, only a date, "
        "in the future, or over a week old, and are left out of the speed numbers. Worst: "
        + ", ".join(f"{name} ({pct(row.time_ok)})" for name, row in worst.iterrows())
        + "."
    )
    lines += ["", "![](charts/1_data_quality.png)", ""]

    # 2. Speed
    s = r["speed"]
    lines += ["## Who's first", ""]
    if s.empty:
        lines.append(f"Not enough shared stories yet (need {args.min_sample}+ per outlet).")
    else:
        top = s.head(3)
        lines.append(
            "On stories at least two outlets ran, these were first most often: "
            + ", ".join(
                f"{row.source_name} {pct(row.first_rate)} (95% CI {pct(row.first_rate_lo)}-"
                f"{pct(row.first_rate_hi)}, n={row.contested})"
                for row in top.itertuples()
            )
            + "."
        )
        by_kind = s.groupby("source_kind").median_lag_min.median()
        if {"wire", "newspaper"} <= set(by_kind.index):
            lines.append("")
            lines.append(
                f"Median delay behind the first report: {minutes(by_kind['wire'])} for wires, "
                f"{minutes(by_kind['newspaper'])} for newspapers (median across outlets)."
            )
    lines += ["", "![](charts/2_speed.png)", ""]

    # 3. Wires vs press
    w = r["wire"]
    lines += ["## Wires vs Indian papers", ""]
    if not w["stories"]:
        lines.append("No stories in this period were run by both a wire and an Indian paper.")
    else:
        lo, hi = w["median_head_start_ci"]
        result = "significant" if w["p_value"] < 0.05 else "not significant"
        lines.append(
            f"{w['stories']:,} stories were run by both. The wire was first on {pct(w['wire_first_rate'])} "
            f"of them ({w['wire_first']} vs {w['press_first']}, {w['ties']} ties). Binomial test "
            f"against 50/50: {p_text(w['p_value'])}, {result}. The median head start was "
            f"{minutes(w['median_head_start_min'])} (95% CI {minutes(lo)} to {minutes(hi)})."
        )
        d = r["dependence"]
        if not d.empty:
            lines.append("")
            lines.append(
                f"For the typical Indian paper, {pct(d.wire_share.median())} of articles are on a story a "
                f"wire also had, and {pct(d.exclusive_share.median())} are on a story nobody else had. "
                f"Highest wire overlap: {d.index[0]} ({pct(d.wire_share.iloc[0])}). Most exclusives: "
                f"{d.exclusive_share.idxmax()} ({pct(d.exclusive_share.max())})."
            )
    lines += ["", "![](charts/3_wire_head_start.png)", "", "![](charts/3_wire_dependence.png)", ""]

    # 4. Overlap
    m = r["overlap"]
    lines += ["## Overlap", ""]
    if m.empty:
        lines.append("Not enough outlets with enough stories to compare.")
    else:
        pairs = cv.top_pairs(m, 3)
        off_diagonal = m.where(~np.eye(len(m), dtype=bool))
        loner = off_diagonal.mean().idxmin()
        lines.append(
            "Most similar pairs (Jaccard): "
            + ", ".join(f"{p.source_a} / {p.source_b} ({pct(p.jaccard)})" for p in pairs.itertuples())
            + f". {loner} has the least in common with everyone else."
        )
    lines += ["", "![](charts/4_overlap.png)", ""]

    # 5. Specialisation
    sp = r["spec"]
    lines += ["## Beats", ""]
    if sp["lq"].empty:
        lines.append("Not enough data to test.")
    else:
        lines.append(
            f"Chi-square({sp['dof']}) = {sp['chi2']:,.0f}, {p_text(sp['p_value'])}, Cramér's V = "
            f"{sp['cramers_v']:.2f}, so a {effect_size(sp['cramers_v'])} link between outlet and category."
        )
        if sp["sparse_cell_share"] > 0.2:
            lines.append(
                f"{pct(sp['sparse_cell_share'])} of cells have an expected count under 5, so take the "
                "p-value with a grain of salt."
            )
        top = sp["top"].head(5)
        lines.append("")
        lines.append(
            f"Biggest concentrations (location quotient, {args.min_sample}+ articles each): "
            + ", ".join(f"{t.source_name} in {t.category} ({t.lq:.1f}x)" for t in top.itertuples())
            + "."
        )
    lines += ["", "![](charts/5_specialisation.png)", ""]

    # 6. Rhythm
    g = r["rhythm"]
    lines += ["## When news is published", ""]
    total = g.to_numpy().sum()
    if total:
        day, hour = np.unravel_index(g.to_numpy().argmax(), g.shape)
        hours = g.sum(axis=0)
        office = hours.loc[9:17].sum() / total
        weekend = g.loc[["Sat", "Sun"]].to_numpy().sum() / total
        lines.append(
            f"Busiest hour: {g.index[day]} {hour:02d}:00 IST. {pct(office)} of articles go out between "
            f"9am and 6pm IST. Weekends get {pct(weekend)} (an even spread would be {pct(2 / 7)})."
        )
    lines += ["", "![](charts/6_rhythm.png)", ""]

    # 7. Reach
    re_ = r["reach"]
    lines += ["## How many outlets run a story", ""]
    if re_.get("stories"):
        lines.append(
            f"{pct(re_['single_source_share'])} of stories were run by one outlet only, and "
            f"{pct(re_['three_plus_share'])} by three or more (average {re_['mean_sources']:.1f}). "
            "The most widely run:"
        )
        lines.append("")
        for row in re_["widest"].head(5).itertuples():
            lines.append(f"- {row.headline} ({row.sources} outlets)")
    lines += ["", "![](charts/7_reach.png)", "", "![](charts/8_scope_trend.png)", ""]

    lines += [
        "## Caveats",
        "",
        "- Publish times come from the publishers. If an outlet rounds or backdates them, its "
        "speed numbers are off.",
        "- A story is a group of similar headlines within 48 hours, so some events get split or "
        "merged. Sharing a story means covering the same event, not copying.",
        "- Feeds only show part of what each outlet publishes, and some sources go quiet for weeks.",
        "- discovered_at isn't used for timing because the ingest only runs once a day.",
        "",
    ]
    return "\n".join(lines)

if __name__ == "__main__":
    main()
