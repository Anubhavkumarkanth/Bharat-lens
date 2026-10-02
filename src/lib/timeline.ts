import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getAiProvider } from "@/lib/ai/provider";
import type { Scope } from "@/config/taxonomy";

export interface TimelineDay {
  /** YYYY-MM-DD */
  date: string;
  count: number;
  /** Outlets covering that day's most widely covered story. */
  sourceCount: number;
  headline: string | null;
  special: boolean;
}

// A day only counts as a big news day if at least 3 different outlets covered
// the same story. Volume alone would flag days where one outlet posted a lot.
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

  // UTC, local time would cut off the last evening of the month in IST
  const monthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)
  );

  // drizzle turns arrays into separate params, so ANY() doesn't work. Build an IN list.
  const scopeList = sql.join(
    scopes.map((s) => sql`${s}`),
    sql`, `
  );

  // aggregate in SQL, there can be tens of thousands of rows
  const rows = (await db.execute(sql`
    WITH day_clusters AS (
      SELECT (discovered_at AT TIME ZONE 'UTC')::date AS day,
             cluster_id,
             COUNT(DISTINCT source_id) AS source_count
      FROM articles
      -- ISO strings, postgres-js can't take Date params here
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

  // median, so one huge day doesn't hide the others
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

// Optional: with an AI key, drop days where the top story is just widely
// syndicated filler. Without a key the result stays as is.
async function verifyWithAi(days: TimelineDay[]): Promise<TimelineDay[]> {
  const ai = getAiProvider();
  if (!ai) return days;

  const candidates = days.filter((d) => d.special && d.headline);
  if (candidates.length === 0) return days;

  const kept = await ai.verifyEvents(candidates.map((d) => d.headline as string));
  if (!kept) return days; // AI failed, keep the original

  const keptSet = new Set(kept);
  return days.map((d) =>
    d.special && d.headline && !keptSet.has(d.headline) ? { ...d, special: false } : d
  );
}
