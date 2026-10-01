import type { ReactNode } from "react";
import { t, type Lang, type UiStringKey } from "@/config/ui-strings";
import type { HealthStatus } from "@/lib/insights";

// Charts for /insights. They're all bars or grids, so plain divs are enough
// and the page doesn't need any client JS. Hover uses title attributes.

export function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function count(value: number): string {
  return value.toLocaleString("en-IN");
}

export function duration(minutes: number, lang: Lang): string {
  return minutes < 60
    ? `${Math.round(minutes)} ${t("insights.min", lang)}`
    : `${(minutes / 60).toFixed(1)} ${t("insights.hours", lang)}`;
}

export function Section({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    // min-w-0 so wide tables scroll inside the card on mobile
    <section className="min-w-0 rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-card">
      <h2 className="font-serif text-xl">{title}</h2>
      <p className="text-sm text-muted mt-1 mb-5 max-w-3xl leading-relaxed">{body}</p>
      {children}
    </section>
  );
}

export function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-card">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="font-serif text-2xl sm:text-3xl mt-1 tabular-nums">{value}</div>
      {detail && <div className="text-xs text-muted mt-0.5">{detail}</div>}
    </div>
  );
}

// 0-1 value as a bar with the % next to it
export function RateBar({ value, label }: { value: number; label?: string }) {
  const width = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-2.5 min-w-[7rem]">
      <div className="relative h-2 flex-1 rounded-full bg-border/60" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${width}%` }} />
      </div>
      <span className="w-10 text-right text-sm tabular-nums">{label ?? percent(value)}</span>
    </div>
  );
}

// Mix accent into the card colour, so it works in light and dark.
function cellColor(intensity: number): string {
  const pct = Math.round(8 + Math.max(0, Math.min(1, intensity)) * 87);
  return `color-mix(in oklab, var(--accent) ${pct}%, var(--surface))`;
}

export function Heatmap({
  rowLabels,
  colLabels,
  values,
  titles,
  cellLabels,
  lang,
  rowHeader,
}: {
  rowLabels: string[];
  colLabels: string[];
  // values[row][col]
  values: number[][];
  titles: string[][];
  // optional text inside a cell
  cellLabels?: (string | null)[][];
  lang: Lang;
  rowHeader?: string;
}) {
  const max = Math.max(...values.flat(), 0) || 1;
  const template = `max-content repeat(${colLabels.length}, minmax(0.85rem, 1fr))`;

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="grid gap-[2px] text-[11px] min-w-max sm:min-w-0" style={{ gridTemplateColumns: template }}>
        <div className="text-muted pr-2 self-end">{rowHeader}</div>
        {colLabels.map((label, c) => (
          <div key={c} className="text-muted text-center self-end pb-1 leading-tight break-words">
            {label}
          </div>
        ))}
        {rowLabels.map((rowLabel, r) => (
          <HeatmapRow
            key={r}
            label={rowLabel}
            values={values[r]}
            titles={titles[r]}
            cellLabels={cellLabels?.[r]}
            max={max}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 text-[11px] text-muted" aria-hidden>
        <span>{t("insights.less", lang)}</span>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => (
          <span key={step} className="h-2.5 w-5 rounded-sm" style={{ background: cellColor(step) }} />
        ))}
        <span>{t("insights.more", lang)}</span>
      </div>
    </div>
  );
}

function HeatmapRow({
  label,
  values,
  titles,
  cellLabels,
  max,
}: {
  label: string;
  values: number[];
  titles: string[];
  cellLabels?: (string | null)[];
  max: number;
}) {
  return (
    <>
      <div className="pr-2 py-1 truncate text-foreground/90 self-center" title={label}>
        {label}
      </div>
      {values.map((value, c) => {
        const intensity = value / max;
        return (
          <div
            key={c}
            title={titles[c]}
            aria-label={titles[c]}
            role="img"
            className={`h-7 rounded-[3px] flex items-center justify-center tabular-nums ${
              intensity > 0.55 ? "text-on-accent" : "text-foreground"
            }`}
            style={{ background: value > 0 ? cellColor(intensity) : "transparent" }}
          >
            {cellLabels?.[c]}
          </div>
        );
      })}
    </>
  );
}

const SERIES_VARS = ["--series-1", "--series-2", "--series-3", "--series-4"];

// 100% stacked bars, one per day/week. Each series keeps its colour slot even
// if it's missing from a bar.
export function StackedShare({
  buckets,
  series,
}: {
  buckets: { label: string; counts: Record<string, number>; total: number }[];
  series: { id: string; label: string }[];
}) {
  return (
    <div className="flex items-end gap-[2px] h-40">
      {buckets.map((bucket) => (
        <div
          key={bucket.label}
          className="flex-1 min-w-[4px] h-full flex flex-col-reverse gap-[2px] rounded-t-[4px] overflow-hidden"
          title={[
            bucket.label,
            ...series.map((s) => `${s.label}: ${percent((bucket.counts[s.id] ?? 0) / bucket.total)}`),
          ].join("\n")}
        >
          {series.map((s, i) => {
            const share = (bucket.counts[s.id] ?? 0) / bucket.total;
            if (share === 0) return null;
            return (
              <div
                key={s.id}
                style={{ height: `${share * 100}%`, background: `var(${SERIES_VARS[i % SERIES_VARS.length]})` }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function SeriesLegend({ series }: { series: { id: string; label: string; detail: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 text-sm">
      {series.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: `var(${SERIES_VARS[i % SERIES_VARS.length]})` }}
            aria-hidden
          />
          <span>{s.label}</span>
          <span className="text-muted tabular-nums">{s.detail}</span>
        </li>
      ))}
    </ul>
  );
}

const STATUS_STYLE: Record<HealthStatus, { color: string; icon: string }> = {
  ok: { color: "var(--status-good)", icon: "●" },
  quiet: { color: "var(--status-warning)", icon: "▲" },
  silent: { color: "var(--status-critical)", icon: "■" },
  never: { color: "var(--status-critical)", icon: "✕" },
};

// Icon + label, so status isn't only shown by colour.
export function StatusBadge({ status, lang }: { status: HealthStatus; lang: Lang }) {
  const { color, icon } = STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span style={{ color }} aria-hidden className="text-[10px]">
        {icon}
      </span>
      {t(`insights.status.${status}` as UiStringKey, lang)}
    </span>
  );
}

export function DataTable({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-border">
            {head.map((cell, i) => (
              <th key={i} className="py-2 pr-4 font-normal whitespace-nowrap">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
