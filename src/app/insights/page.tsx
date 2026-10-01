import type { Metadata } from "next";
import Link from "next/link";
import { getLang } from "@/lib/lang";
import { t, UI_STRINGS, type Lang, type UiStringKey } from "@/config/ui-strings";
import { requestNow } from "@/lib/clock";
import { INSIGHT_WINDOWS, MIN_SAMPLE, type InsightWindow } from "@/config/insights";
import { AnalyticsNotInstalledError, getInsights, type Insights } from "@/lib/insights";
import {
  count,
  DataTable,
  duration,
  Heatmap,
  percent,
  RateBar,
  Section,
  SeriesLegend,
  StackedShare,
  StatTile,
  StatusBadge,
} from "@/components/insights-charts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Insights | Bharat Lens",
};

function parseWindow(value: unknown): InsightWindow {
  const n = Number(value);
  return (INSIGHT_WINDOWS as readonly number[]).includes(n) ? (n as InsightWindow) : INSIGHT_WINDOWS[0];
}

export default async function InsightsPage(props: PageProps<"/insights">) {
  const lang = await getLang();
  const searchParams = await props.searchParams;
  const windowDays = parseWindow(searchParams.days);
  const now = requestNow();

  let insights: Insights;
  try {
    insights = await getInsights(windowDays, now);
  } catch (error) {
    if (error instanceof AnalyticsNotInstalledError) return <NotInstalled lang={lang} />;
    throw error;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">{t("insights.title", lang)}</h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">{t("insights.subtitle", lang)}</p>
        </div>
        <WindowPicker active={windowDays} lang={lang} />
      </header>

      {insights.overview.articles === 0 ? (
        <p data-insights-state="empty" className="text-center py-24 text-muted">
          {t("insights.empty", lang)}
        </p>
      ) : (
        <>
          <Overview insights={insights} lang={lang} />
          <div className="grid gap-6 lg:grid-cols-2 items-start">
            <Speed insights={insights} lang={lang} />
            <Wire insights={insights} lang={lang} />
          </div>
          <ScopeShare insights={insights} lang={lang} />
          <CategoryMix insights={insights} lang={lang} />
          <div className="grid gap-6 lg:grid-cols-2 items-start">
            <Rhythm insights={insights} lang={lang} />
            <Overlap insights={insights} lang={lang} />
          </div>
          <Health insights={insights} lang={lang} />
          <Section title={t("insights.method.title", lang)} body={t("insights.method.body", lang)}>
            <p className="text-xs text-muted">
              {t("insights.minSample", lang)} {MIN_SAMPLE}
            </p>
          </Section>
        </>
      )}
    </div>
  );
}

function WindowPicker({ active, lang }: { active: InsightWindow; lang: Lang }) {
  const ordered = [...INSIGHT_WINDOWS].sort((a, b) => a - b);
  return (
    <nav className="flex gap-1.5 shrink-0" aria-label={t("insights.title", lang)}>
      {ordered.map((days) => (
        <Link
          key={days}
          href={`/insights?days=${days}`}
          aria-current={days === active ? "page" : undefined}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors whitespace-nowrap ${
            days === active
              ? "border-accent bg-accent-soft text-foreground"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          {t("insights.windowPrefix", lang)} {days} {t("insights.days", lang)}
        </Link>
      ))}
    </nav>
  );
}

function Overview({ insights, lang }: { insights: Insights; lang: Lang }) {
  const o = insights.overview;
  const of = t("insights.kpi.of", lang);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatTile label={t("insights.kpi.articles", lang)} value={count(o.articles)} />
      <StatTile label={t("insights.kpi.stories", lang)} value={count(o.stories)} />
      <StatTile
        label={t("insights.kpi.shared", lang)}
        value={percent(o.stories ? o.sharedStories / o.stories : null)}
        detail={`${count(o.sharedStories)} ${of} ${count(o.stories)}`}
      />
      <StatTile
        label={t("insights.kpi.sources", lang)}
        value={`${o.activeSources}`}
        detail={`${of} ${o.configuredSources}`}
      />
      <StatTile label={t("insights.kpi.usableTime", lang)} value={percent(o.usableTimeRate)} />
      <StatTile label={t("insights.kpi.grounded", lang)} value={percent(o.groundedRate)} />
    </div>
  );
}

function Speed({ insights, lang }: { insights: Insights; lang: Lang }) {
  return (
    <Section title={t("insights.speed.title", lang)} body={t("insights.speed.body", lang)}>
      {insights.speed.length === 0 ? (
        <p className="text-sm text-muted">{t("insights.empty", lang)}</p>
      ) : (
        <DataTable
          head={[
            t("insights.mix.outlet", lang),
            t("insights.speed.firstRate", lang),
            t("insights.speed.medianLag", lang),
            t("insights.speed.stories", lang),
          ]}
        >
          {insights.speed.map((row) => (
            <tr key={row.sourceId}>
              <td className="py-2 pr-4 whitespace-nowrap">{row.sourceName}</td>
              <td className="py-2 pr-4">
                <RateBar value={row.firstRate} />
              </td>
              <td className="py-2 pr-4 tabular-nums whitespace-nowrap">
                {duration(row.medianLagMinutes, lang)}
              </td>
              <td className="py-2 tabular-nums text-muted">{count(row.contested)}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </Section>
  );
}

function Wire({ insights, lang }: { insights: Insights; lang: Lang }) {
  return (
    <Section title={t("insights.wire.title", lang)} body={t("insights.wire.body", lang)}>
      {insights.wire.length === 0 ? (
        <p className="text-sm text-muted">{t("insights.empty", lang)}</p>
      ) : (
        <DataTable
          head={[
            t("insights.mix.outlet", lang),
            t("insights.wire.shared", lang),
            t("insights.wire.exclusive", lang),
          ]}
        >
          {insights.wire.map((row) => (
            <tr key={row.sourceId}>
              <td className="py-2 pr-4 whitespace-nowrap">{row.sourceName}</td>
              <td className="py-2 pr-4">
                <RateBar value={row.wireShare} />
              </td>
              <td className="py-2">
                <RateBar value={row.exclusiveShare} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </Section>
  );
}

function ScopeShare({ insights, lang }: { insights: Insights; lang: Lang }) {
  const { scopes, buckets } = insights.scopeShare;
  const series = scopes.map((id) => ({ id, label: t(`scope.${id}` as UiStringKey, lang) }));
  const totals = Object.fromEntries(
    scopes.map((id) => [id, buckets.reduce((sum, b) => sum + (b.counts[id] ?? 0), 0)])
  );
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  const storiesWord = t("insights.scope.stories", lang);

  return (
    <Section title={t("insights.scope.title", lang)} body={t("insights.scope.body", lang)}>
      <StackedShare
        buckets={buckets.map((b) => ({ label: b.bucket, counts: b.counts, total: b.total }))}
        series={series}
      />
      <div className="flex justify-between text-[11px] text-muted mt-1.5 tabular-nums">
        <span>{buckets[0]?.bucket}</span>
        <span>{buckets.at(-1)?.bucket}</span>
      </div>
      {/* Shares are written out in the legend since two of the colours are
          low-contrast in light mode. */}
      <SeriesLegend
        series={series.map((s) => ({
          ...s,
          detail: `${percent(grandTotal ? totals[s.id] / grandTotal : null)} · ${count(totals[s.id])} ${storiesWord}`,
        }))}
      />
    </Section>
  );
}

function CategoryMix({ insights, lang }: { insights: Insights; lang: Lang }) {
  const { sources, categories, share, counts } = insights.categoryMix;
  const categoryLabels = categories.map((c) => t(`category.${c}` as UiStringKey, lang));
  const values = sources.map((s) => categories.map((c) => share[s.id]?.[c] ?? 0));

  return (
    <Section title={t("insights.mix.title", lang)} body={t("insights.mix.body", lang)}>
      <Heatmap
        lang={lang}
        rowHeader={t("insights.mix.outlet", lang)}
        rowLabels={sources.map((s) => s.name)}
        colLabels={categoryLabels}
        values={values}
        titles={sources.map((s) =>
          categories.map(
            (c, i) =>
              `${s.name} · ${categoryLabels[i]}: ${percent(share[s.id]?.[c] ?? 0)} (${count(counts[s.id]?.[c] ?? 0)})`
          )
        )}
        // only label the big cells
        cellLabels={values.map((row) => row.map((v) => (v >= 0.2 ? percent(v) : null)))}
      />
    </Section>
  );
}

function Rhythm({ insights, lang }: { insights: Insights; lang: Lang }) {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const cell of insights.rhythm) grid[cell.dow - 1][cell.hour] = cell.count;
  const dayLabels = Array.from({ length: 7 }, (_, i) => t(`insights.dow.${i + 1}` as UiStringKey, lang));
  const hourLabels = Array.from({ length: 24 }, (_, h) => (h % 6 === 0 ? String(h).padStart(2, "0") : ""));
  const articlesWord = t("insights.rhythm.articles", lang);

  return (
    <Section title={t("insights.rhythm.title", lang)} body={t("insights.rhythm.body", lang)}>
      <Heatmap
        lang={lang}
        rowLabels={dayLabels}
        colLabels={hourLabels}
        values={grid}
        titles={grid.map((row, d) =>
          row.map((n, h) => `${dayLabels[d]} ${String(h).padStart(2, "0")}:00 · ${count(n)} ${articlesWord}`)
        )}
      />
    </Section>
  );
}

function Overlap({ insights, lang }: { insights: Insights; lang: Lang }) {
  return (
    <Section title={t("insights.overlap.title", lang)} body={t("insights.overlap.body", lang)}>
      {insights.overlap.length === 0 ? (
        <p className="text-sm text-muted">{t("insights.empty", lang)}</p>
      ) : (
        <DataTable
          head={[
            t("insights.overlap.pair", lang),
            t("insights.overlap.similarity", lang),
            t("insights.overlap.shared", lang),
          ]}
        >
          {insights.overlap.map((row) => (
            <tr key={`${row.sourceA}|${row.sourceB}`}>
              <td className="py-2 pr-4">
                {row.sourceA} <span className="text-muted">·</span> {row.sourceB}
              </td>
              <td className="py-2 pr-4">
                <RateBar value={row.jaccard} />
              </td>
              <td className="py-2 tabular-nums text-muted">{count(row.shared)}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </Section>
  );
}

function Health({ insights, lang }: { insights: Insights; lang: Lang }) {
  return (
    <Section title={t("insights.health.title", lang)} body={t("insights.health.body", lang)}>
      <DataTable
        head={[
          t("insights.health.source", lang),
          t("insights.health.status", lang),
          t("insights.health.lastArticle", lang),
          t("insights.health.articles", lang),
          t("insights.health.usableTime", lang),
          t("insights.health.grounded", lang),
          t("insights.health.words", lang),
          t("insights.health.discovery", lang),
        ]}
      >
        {insights.health.map((row) => (
          <tr key={row.sourceId}>
            <td className="py-2 pr-4 whitespace-nowrap">{row.sourceName}</td>
            <td className="py-2 pr-4">
              <StatusBadge status={row.status} lang={lang} />
            </td>
            <td className="py-2 pr-4 tabular-nums whitespace-nowrap text-muted">
              {row.daysSilent === null
                ? t("insights.never", lang)
                : `${Math.floor(row.daysSilent)} ${t("insights.daysAgo", lang)}`}
            </td>
            <td className="py-2 pr-4 tabular-nums">{count(row.articles)}</td>
            <td className="py-2 pr-4 tabular-nums">{percent(row.usableTimeRate)}</td>
            <td className="py-2 pr-4 tabular-nums">{percent(row.groundedRate)}</td>
            <td className="py-2 pr-4 tabular-nums">
              {row.medianWords === null ? "—" : count(Math.round(row.medianWords))}
            </td>
            <td className="py-2 whitespace-nowrap text-muted">
              {discoveryLabel(row.discoveryMethod, lang)}
            </td>
          </tr>
        ))}
      </DataTable>
    </Section>
  );
}

// Falls back to the raw id if there's no label for it.
function discoveryLabel(method: string | null, lang: Lang): string {
  if (!method) return "—";
  const key = `insights.discovery.${method}`;
  return key in UI_STRINGS ? t(key as UiStringKey, lang) : method;
}

function NotInstalled({ lang }: { lang: Lang }) {
  return (
    <div data-insights-state="not-installed" className="max-w-2xl mx-auto py-20">
      <h1 className="font-serif text-2xl">{t("insights.notInstalledTitle", lang)}</h1>
      <p className="text-sm text-muted mt-2">{t("insights.notInstalledBody", lang)}</p>
      <pre className="mt-4 rounded-xl border border-border bg-surface p-4 text-xs overflow-x-auto">
        psql &quot;$DATABASE_URL&quot; -f drizzle/manual/0002_analytics_views.sql
      </pre>
    </div>
  );
}
