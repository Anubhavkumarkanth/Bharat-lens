import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getAiProvider } from "@/lib/ai/provider";
import type { Scope } from "@/config/taxonomy";

export interface TimelineDay {
  /** YYYY-MM-DD, the value the feed filters on. */
  date: string;
  count: number;
  /** Distinct outlets covering that day's most-corroborated story. */
  sourceCount: number;
  headline: string | null;
  special: boolean;
}

/**
 * A day is only special if several *different* outlets covered the same story.
 *
 * That is the whole anti-noise mechanism, and it needs no AI: a bot farm, a
 * scraper loop, or one outlet spamming a tag all produce volume from one or two
 * origins, while a real event gets picked up across the wire. Volume alone would
 * mark every slow news day where one publisher went heavy on listicles.
 */
const MIN_SOURCES_FOR_EVENT = 3;
const VOLUME_MULTIPLIER = 1.25;

interface DayRow {
  day: string;
  total: number;
  peak_sources: number;
  headline: string | null;
}

export async function getMonthTimeline(
  scopes: Scope[],
  monthStart: Date
): Promise<TimelineDay[]> {
  if (scopes.length === 0) return [];

  // UTC throughout: a local-time month end lands 5.5h early in IST and silently
  // drops the last evening of the month.
  const monthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)
  );

  // drizzle's sql template expands a JS array into separate placeholders rather
  // than one array parameter, so `= ANY(${scopes})` fails with "requires array
  // on right side". Build the IN list explicitly instead.
  const scopeList = sql.join(
    scopes.map((s) => sql`${s}`),
    sql`, `
  );

  // Aggregated in SQL rather than pulled into JS — a busy month is tens of
  // thousands of rows and only one number per day survives.
  const rows = (await db.execute(sql`
    WITH day_clusters AS (
      SELECT (discovered_at AT TIME ZONE 'UTC')::date AS day,
             cluster_id,
             COUNT(DISTINCT source_id) AS source_count
      FROM articles
      -- ISO strings, not Date objects: drizzle's raw-SQL path hands params
      -- straight to postgres-js, which only serializes strings and buffers.
      WHERE discovered_at >= ${monthStart.toISOString()}::timestamptz
        AND discovered_at < ${monthEnd.toISOString()}::timestamptz
        AND scope IN (${scopeList})
      GROUP BY 1, 2
    ),
    day_totals AS (
      SELECT day,
             SUM(source_count)::int AS total,
             MAX(source_count)::int AS peak_sources
      FROM day_clusters
      GROUP BY day
    )
    SELECT dt.day::text AS day,
           dt.total,
           dt.peak_sources,
           (SELECT a.title
              FROM day_clusters dc
              JOIN articles a ON a.cluster_id = dc.cluster_id
             WHERE dc.day = dt.day
             ORDER BY dc.source_count DESC, a.rank_score DESC
             LIMIT 1) AS headline
    FROM day_totals dt
    ORDER BY dt.day
  `)) as unknown as DayRow[];

  if (rows.length === 0) return [];

  // Median, not mean: one enormous day would drag a mean up and hide every
  // other spike in the month behind it.
  const sorted = [...rows].map((r) => r.total).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;

  const days: TimelineDay[] = rows.map((r) => ({
    date: r.day,
    count: r.total,
    sourceCount: r.peak_sources,
    headline: r.headline,
    special: r.peak_sources >= MIN_SOURCES_FOR_EVENT && r.total > median * VOLUME_MULTIPLIER,
  }));

  return verifyWithAi(days);
}

/**
 * Optional second pass. With a provider configured, the model drops days whose
 * headline is filler that happened to be syndicated widely. With no key — the
 * default — the deterministic result stands unchanged, per rule 1.
 */
async function verifyWithAi(days: TimelineDay[]): Promise<TimelineDay[]> {
  const ai = getAiProvider();
  if (!ai) return days;

  const candidates = days.filter((d) => d.special && d.headline);
  if (candidates.length === 0) return days;

  const kept = await ai.verifyEvents(candidates.map((d) => d.headline as string));
  if (!kept) return days; // provider failed — never downgrade the free result

  const keptSet = new Set(kept);
  return days.map((d) =>
    d.special && d.headline && !keptSet.has(d.headline) ? { ...d, special: false } : d
  );
}
