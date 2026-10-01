"""Matplotlib charts for the analysis, one function per question.

One colour for single series, a light-to-accent ramp for heatmaps, blue/red for
above/below average, and fixed colours for the four scopes.
"""

from __future__ import annotations

import matplotlib
import matplotlib.ticker
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap, TwoSlopeNorm

ACCENT = "#0b6e74"
INK = "#14171c"
MUTED = "#5b6270"
GRID = "#e2e5ea"
SURFACE = "#ffffff"
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
SCOPE_ORDER = ["india", "india-abroad", "impact-on-india", "world"]
SCOPE_LABELS = {
    "india": "India",
    "india-abroad": "India Abroad",
    "impact-on-india": "Impact on India",
    "world": "World",
}

SEQUENTIAL = LinearSegmentedColormap.from_list("accent", ["#f4f7f7", "#9fcfcf", ACCENT, "#06393c"])
DIVERGING = LinearSegmentedColormap.from_list("blue_grey_red", ["#256abf", "#f0efec", "#d03b3b"])

plt.rcParams.update(
    {
        "figure.facecolor": SURFACE,
        "axes.facecolor": SURFACE,
        "axes.edgecolor": GRID,
        "axes.labelcolor": MUTED,
        "axes.titlecolor": INK,
        "axes.titlesize": 12,
        "axes.titleweight": "bold",
        "axes.titlelocation": "left",
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": False,
        "grid.color": GRID,
        "grid.linewidth": 0.8,
        "xtick.color": MUTED,
        "ytick.color": INK,
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "font.size": 10,
        "legend.frameon": False,
        "legend.fontsize": 9,
    }
)


def _hbar_axes(n_rows: int, width: float = 7.5):
    fig, ax = plt.subplots(figsize=(width, max(2.2, 0.28 * n_rows + 1.1)))
    ax.xaxis.grid(True)
    ax.set_axisbelow(True)
    ax.spines["left"].set_visible(False)
    ax.tick_params(axis="y", length=0)
    return fig, ax


def _percent_axis(ax, limit: float = 1.0):
    ax.set_xlim(0, limit)
    ax.xaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))


def _note(fig, text: str):
    fig.text(0.01, 0.005, text, fontsize=8, color=MUTED, ha="left", va="bottom")


def data_quality_chart(quality: pd.DataFrame) -> plt.Figure:
    q = quality.sort_values("time_ok")
    fig, ax = _hbar_axes(len(q))
    ax.barh(q.index, q.time_ok, color=ACCENT, height=0.6)
    _percent_axis(ax)
    ax.set_title("Share of articles with a usable publish time, by source")
    _note(fig, "Rejected: missing, date-only (padded to midnight), future-dated, or >7 days stale.")
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    return fig


def speed_chart(speed: pd.DataFrame, top: int = 20) -> plt.Figure:
    s = speed.head(top).iloc[::-1]
    fig, ax = _hbar_axes(len(s))
    ax.barh(s.source_name, s.first_rate, color=ACCENT, height=0.6)
    ax.errorbar(
        s.first_rate,
        s.source_name,
        xerr=[s.first_rate - s.first_rate_lo, s.first_rate_hi - s.first_rate],
        fmt="none",
        ecolor=INK,
        elinewidth=1,
        capsize=2,
    )
    _percent_axis(ax, min(1.0, float(s.first_rate_hi.max()) + 0.05))
    ax.set_title("How often each outlet reported a shared story first")
    _note(fig, "Whiskers: 95% Wilson interval. Only stories 2+ outlets covered with usable times.")
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    return fig


def head_start_chart(head_start: pd.Series, clip_minutes: int = 360) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(7.5, 3.4))
    values = head_start.clip(-clip_minutes, clip_minutes)
    ax.hist(values, bins=np.arange(-clip_minutes, clip_minutes + 30, 30), color=ACCENT, rwidth=0.88)
    ax.axvline(0, color=INK, linewidth=1)
    ax.yaxis.grid(True)
    ax.set_axisbelow(True)
    ax.set_xlabel("Minutes the earliest wire report led the earliest Indian newspaper (negative = press first)")
    ax.set_ylabel("Stories")
    ax.set_title("Wire head start on stories both carried")
    _note(fig, f"Clipped at ±{clip_minutes} min; the tails are counted in the end bins.")
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    return fig


def wire_dependence_chart(dependence: pd.DataFrame) -> plt.Figure:
    d = dependence.sort_values("wire_share")
    fig, ax = _hbar_axes(len(d))
    y = np.arange(len(d))
    ax.barh(y + 0.18, d.wire_share, height=0.34, color=SERIES[0], label="Story also carried by a wire")
    ax.barh(y - 0.18, d.exclusive_share, height=0.34, color=SERIES[1], label="Story no other outlet carried")
    ax.set_yticks(y, d.index)
    _percent_axis(ax, min(1.0, float(d[["wire_share", "exclusive_share"]].max().max()) + 0.1))
    ax.legend(loc="lower right")
    ax.set_title("Indian newspapers: wire-shared versus exclusive stories")
    fig.tight_layout()
    return fig


def overlap_heatmap(matrix: pd.DataFrame) -> plt.Figure:
    size = max(5.0, 0.26 * len(matrix) + 2)
    fig, ax = plt.subplots(figsize=(size + 1, size))
    shown = matrix.to_numpy(dtype=float, copy=True)
    np.fill_diagonal(shown, np.nan)  # self-similarity is 1 by definition and drowns the scale
    image = ax.imshow(shown, cmap=SEQUENTIAL, vmin=0)
    ax.set_xticks(range(len(matrix)), matrix.columns, rotation=90)
    ax.set_yticks(range(len(matrix)), matrix.index)
    ax.tick_params(length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    bar = fig.colorbar(image, ax=ax, shrink=0.6, format=matplotlib.ticker.PercentFormatter(1.0, decimals=0))
    bar.outline.set_visible(False)
    ax.set_title("Story overlap between outlets (Jaccard), clustered")
    fig.tight_layout()
    return fig


def specialisation_heatmap(lq: pd.DataFrame) -> plt.Figure:
    """Heatmap of log2(LQ), so 2x and 0.5x are the same distance from 0."""
    with np.errstate(divide="ignore"):
        values = np.log2(lq.replace(0, np.nan)).clip(-2, 2)
    fig, ax = plt.subplots(figsize=(0.62 * lq.shape[1] + 3.5, 0.3 * lq.shape[0] + 2))
    # grey for zero articles
    cmap = DIVERGING.with_extremes(bad="#b4b9c0")
    image = ax.imshow(values, cmap=cmap, norm=TwoSlopeNorm(vcenter=0, vmin=-2, vmax=2), aspect="auto")
    ax.set_xticks(range(lq.shape[1]), lq.columns, rotation=45, ha="right")
    ax.set_yticks(range(lq.shape[0]), lq.index)
    ax.tick_params(length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    bar = fig.colorbar(image, ax=ax, shrink=0.7, ticks=[-2, -1, 0, 1, 2])
    bar.ax.set_yticklabels(["¼×", "½×", "corpus", "2×", "4×"])
    bar.outline.set_visible(False)
    ax.set_title("Category concentration vs the corpus (location quotient)")
    _note(fig, "Dark grey: no articles in that category. Clipped at 4× either way.")
    fig.tight_layout(rect=(0, 0.02, 1, 1))
    return fig


def rhythm_heatmap(grid: pd.DataFrame, tz_label: str = "IST") -> plt.Figure:
    fig, ax = plt.subplots(figsize=(9, 3.2))
    image = ax.imshow(grid, cmap=SEQUENTIAL, aspect="auto", vmin=0)
    ax.set_xticks(range(0, 24, 3), [f"{h:02d}:00" for h in range(0, 24, 3)])
    ax.set_yticks(range(len(grid)), grid.index)
    ax.tick_params(length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    bar = fig.colorbar(image, ax=ax, shrink=0.8)
    bar.outline.set_visible(False)
    ax.set_title(f"Articles by weekday and hour of publication ({tz_label})")
    fig.tight_layout()
    return fig


def reach_chart(distribution: pd.Series) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(7.5, 3.2))
    ax.bar(distribution.index.astype(str), distribution.values, color=ACCENT, width=0.6)
    ax.yaxis.grid(True)
    ax.set_axisbelow(True)
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))
    ax.set_xlabel("Outlets carrying the story")
    ax.set_title("How widely is a story carried?")
    fig.tight_layout()
    return fig


def scope_trend_chart(trend: pd.DataFrame) -> plt.Figure:
    scopes = [s for s in SCOPE_ORDER if s in trend.columns]
    fig, ax = plt.subplots(figsize=(8, 3.6))
    x = np.arange(len(trend))
    bottom = np.zeros(len(trend))
    for slot, scope in enumerate(scopes):
        values = trend[scope].to_numpy()
        ax.bar(
            x,
            values,
            bottom=bottom,
            width=0.8,
            color=SERIES[slot],
            edgecolor=SURFACE,  # the 2px surface gap between stacked segments
            linewidth=1.5,
            label=SCOPE_LABELS.get(scope, scope),
        )
        bottom += values
    ax.set_xticks(x, [str(d) for d in trend.index], rotation=45, ha="right")
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))
    ax.set_ylim(0, 1)
    ax.legend(loc="upper left", bbox_to_anchor=(1, 1))
    ax.set_title("Share of new stories by section, per week")
    fig.tight_layout()
    return fig
