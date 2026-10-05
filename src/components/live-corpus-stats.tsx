"use client";

import { useEffect, useState } from "react";

/**
 * A small live view of GET /api/stats, rendered on the insights dashboard.
 *
 * This is the one place the UI consumes the REST API from the browser (the feed
 * and reader are server-rendered for speed and SEO). It demonstrates the full
 * loading / error / success cycle, and doubles as the live data-quality monitor:
 * dupSourceClusters is an invariant that must stay 0, so it is shown with an
 * explicit OK / check-needed signal rather than buried in a number.
 */

interface Stats {
  totalArticles: number;
  totalStories: number;
  multiOutletStories: number;
  activeSources: number;
  dupSourceClusters: number;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stats: Stats };

export function LiveCorpusStats() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const body = await res.json();
        if (!cancelled) setState({ status: "ready", stats: body.data });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-border bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        Couldn&rsquo;t load live stats: {state.message}
      </div>
    );
  }

  const s = state.stats;
  const clustersOk = s.dupSourceClusters === 0;

  const tiles: { label: string; value: string; detail?: string; ok?: boolean }[] = [
    { label: "Articles", value: s.totalArticles.toLocaleString() },
    { label: "Stories", value: s.totalStories.toLocaleString(), detail: "clusters" },
    { label: "Multi-outlet", value: s.multiOutletStories.toLocaleString(), detail: "same story, 2+ sources" },
    { label: "Sources", value: String(s.activeSources), detail: "producing" },
    {
      label: "Dup-source",
      value: String(s.dupSourceClusters),
      detail: clustersOk ? "invariant holds" : "needs a recluster",
      ok: clustersOk,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-border bg-surface p-3.5">
          <div className="text-xs uppercase tracking-wide text-muted">{t.label}</div>
          <div className={`text-2xl font-semibold mt-1 ${t.ok === false ? "text-red-500" : ""}`}>
            {t.value}
          </div>
          {t.detail && (
            <div className={`text-[11px] mt-0.5 ${t.ok === true ? "text-emerald-500" : "text-muted"}`}>
              {t.ok === true ? "\u2713 " : ""}
              {t.detail}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
