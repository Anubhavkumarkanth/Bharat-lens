import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { SOURCES } from "@/config/sources";
import { CATEGORIES, SCOPES, type Scope } from "@/config/taxonomy";
import {
  DAILY_BUCKETS_UP_TO,
  HEATMAP_SOURCES,
  MIN_SAMPLE,
  OVERLAP_PAIRS,
  QUIET_AFTER_DAYS,
  RHYTHM_TIMEZONE,
  SILENT_AFTER_DAYS,
} from "@/config/insights";

// Queries for /insights. They read the analytics.* views
// (drizzle/manual/0002_analytics_views.sql), same as the Python notebook.
//
// Note the ::int / ::float8 casts: postgres-js returns bigint and numeric as
// strings, which then sort and add wrong without any error.

export interface Overview {
  articles: number;
  stories: number;
  sharedStories: number;
  activeSources: number;
  configuredSources: number;
  usableTimeRate: number | null;
  groundedRate: number | null;
}

export interface SpeedRow {
  sourceId: string;
  sourceName: string;
  kind: string;
  contested: number;
  firsts: number;
  firstRate: number;
  medianLagMinutes: number;
}

export interface WireRow {
  sourceId: string;
  sourceName: string;
  articles: number;
  wireShare: number;
  exclusiveShare: number;
}

export interface OverlapRow {
  sourceA: string;
  sourceB: string;
  shared: number;
  jaccard: number;
}

export interface CategoryMix {
  sources: { id: string; name: string; total: number }[];
  categories: string[];
  // share[sourceId][category] = fraction of that source's articles
  share: Record<string, Record<string, number>>;
  counts: Record<string, Record<string, number>>;
}

export interface RhythmCell {
  // ISO weekday, 1 = Monday
  dow: number;
  hour: number;
  count: number;
}

export interface ScopeBucket {
  bucket: string;
  counts: Record<string, number>;
  total: number;
}

export type HealthStatus = "ok" | "quiet" | "silent" | "never";

export interface HealthRow {
  sourceId: string;
  sourceName: string;
  discoveryMethod: string | null;
  articles: number;
  lastArticleAt: string | null;
  daysSilent: number | null;
  status: HealthStatus;
  usableTimeRate: number | null;
  groundedRate: number | null;
  medianWords: number | null;
}

export interface Insights {
  windowDays: number;
  overview: Overview;
  speed: SpeedRow[];
  wire: WireRow[];
  overlap: OverlapRow[];
  categoryMix: CategoryMix;
  rhythm: RhythmCell[];
  scopeShare: { granularity: "day" | "week"; scopes: Scope[]; buckets: ScopeBucket[] };
  health: HealthRow[];
}

// Thrown when the analytics views haven't been created yet.
export class AnalyticsNotInstalledError extends Error {}

const MISSING_RELATION_CODES = new Set(["42P01", "3F000"]); // undefined_table, invalid_schema_name

function isMissingRelation(error: unknown): boolean {
  // drizzle wraps the postgres error, so check .cause too
  for (let e: unknown = error, depth = 0; e && depth < 3; depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && MISSING_RELATION_CODES.has(code)) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

type Row = Record<string, unknown>;

async function rows<T = Row>(query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export async function getInsights(windowDays: number, now: number): Promise<Insights> {
  // ISO string, not a Date (postgres-js can't serialize Dates in raw sql)
  const since = new Date(now - windowDays * 86_400_000).toISOString();

  try {
    const [overview, speed, wire, overlap, categoryMix, rhythm, scopeShare, health] =
      await Promise.all([
        getOverview(since),
        getSpeed(since),
        getWireDependence(since),
        getOverlap(since),
        getCategoryMix(since),
        getRhythm(since),
        getScopeShare(since, windowDays),
        getHealth(since, now),
      ]);
    return { windowDays, overview, speed, wire, overlap, categoryMix, rhythm, scopeShare, health };
  } catch (error) {
    if (isMissingRelation(error)) throw new AnalyticsNotInstalledError();
    throw error;
  }
}

async function getOverview(since: string): Promise<Overview> {
  const [r] = await rows<{
    articles: number;
    stories: number;
    shared_stories: number;
    active_sources: number;
    usable_time_rate: number | null;
    grounded_rate: number | null;
  }>(sql`
    SELECT COUNT(*)::int AS articles,
           COUNT(DISTINCT cluster_id)::int AS stories,
           COUNT(DISTINCT cluster_id) FILTER (WHERE cluster_sources >= 2)::int AS shared_stories,
           COUNT(DISTINCT source_id)::int AS active_sources,
           AVG((time_quality = 'ok')::int)::float8 AS usable_time_rate,
           AVG(grounded::int)::float8 AS grounded_rate
    FROM analytics.article_facts
    WHERE discovered_at >= ${since}::timestamptz
  `);
  return {
    articles: r.articles,
    stories: r.stories,
    sharedStories: r.shared_stories,
    activeSources: r.active_sources,
    configuredSources: SOURCES.length,
    usableTimeRate: r.articles > 0 ? r.usable_time_rate : null,
    groundedRate: r.grounded_rate,
  };
}

// Who publishes first. Only stories 2+ outlets covered (with usable times)
// count, otherwise big outlets win just by volume. Ties count for everyone.
async function getSpeed(since: string): Promise<SpeedRow[]> {
  const result = await rows<{
    source_id: string;
    source_name: string;
    source_kind: string;
    contested: number;
    firsts: number;
    median_lag: number;
  }>(sql`
    SELECT source_id, source_name, source_kind,
           COUNT(*)::int AS contested,
           COUNT(*) FILTER (WHERE reported_first)::int AS firsts,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lag_minutes)::float8 AS median_lag
    FROM analytics.article_facts
    WHERE discovered_at >= ${since}::timestamptz
      AND reported_at IS NOT NULL
      AND cluster_timed_sources >= 2
    GROUP BY source_id, source_name, source_kind
    HAVING COUNT(*) >= ${MIN_SAMPLE}
  `);
  return result
    .map((r) => ({
      sourceId: r.source_id,
      sourceName: r.source_name,
      kind: r.source_kind,
      contested: r.contested,
      firsts: r.firsts,
      firstRate: r.firsts / r.contested,
      medianLagMinutes: r.median_lag,
    }))
    .sort((a, b) => b.firstRate - a.firstRate || a.medianLagMinutes - b.medianLagMinutes);
}

// Indian papers: share of articles on a story a wire also had, and share
// nobody else had. Stories are matched on headlines, so this is "same event",
// not "copied".
async function getWireDependence(since: string): Promise<WireRow[]> {
  const result = await rows<{
    source_id: string;
    source_name: string;
    articles: number;
    wire_share: number;
    exclusive_share: number;
  }>(sql`
    SELECT source_id, source_name,
           COUNT(*)::int AS articles,
           AVG(cluster_has_wire::int)::float8 AS wire_share,
           AVG((cluster_sources = 1)::int)::float8 AS exclusive_share
    FROM analytics.article_facts
    WHERE discovered_at >= ${since}::timestamptz
      AND source_kind = 'newspaper'
      AND source_country = 'IN'
    GROUP BY source_id, source_name
    HAVING COUNT(*) >= ${MIN_SAMPLE}
    ORDER BY wire_share DESC
  `);
  return result.map((r) => ({
    sourceId: r.source_id,
    sourceName: r.source_name,
    articles: r.articles,
    wireShare: r.wire_share,
    exclusiveShare: r.exclusive_share,
  }));
}

// Jaccard similarity between two outlets' sets of stories.
async function getOverlap(since: string): Promise<OverlapRow[]> {
  const result = await rows<{ name_a: string; name_b: string; shared: number; jaccard: number }>(sql`
    WITH sc AS (
      SELECT DISTINCT source_id, source_name, cluster_id
      FROM analytics.article_facts
      WHERE discovered_at >= ${since}::timestamptz
    ),
    totals AS (
      SELECT source_id, COUNT(*) AS n FROM sc GROUP BY source_id
    ),
    pairs AS (
      SELECT a.source_id AS id_a, b.source_id AS id_b,
             a.source_name AS name_a, b.source_name AS name_b,
             COUNT(*) AS shared
      FROM sc a
      JOIN sc b ON a.cluster_id = b.cluster_id AND a.source_id < b.source_id
      GROUP BY 1, 2, 3, 4
    )
    SELECT p.name_a, p.name_b, p.shared::int AS shared,
           (p.shared::float8 / (ta.n + tb.n - p.shared)) AS jaccard
    FROM pairs p
    JOIN totals ta ON ta.source_id = p.id_a
    JOIN totals tb ON tb.source_id = p.id_b
    WHERE p.shared >= ${MIN_SAMPLE}
    ORDER BY jaccard DESC
    LIMIT ${OVERLAP_PAIRS}
  `);
  return result.map((r) => ({
    sourceA: r.name_a,
    sourceB: r.name_b,
    shared: r.shared,
    jaccard: r.jaccard,
  }));
}

async function getCategoryMix(since: string): Promise<CategoryMix> {
  const result = await rows<{ source_id: string; source_name: string; category: string; n: number }>(sql`
    WITH top_sources AS (
      SELECT source_id
      FROM analytics.article_base
      WHERE discovered_at >= ${since}::timestamptz
      GROUP BY source_id
      ORDER BY COUNT(*) DESC
      LIMIT ${HEATMAP_SOURCES}
    )
    SELECT b.source_id, b.source_name, b.category, COUNT(*)::int AS n
    FROM analytics.article_base b
    JOIN top_sources t ON t.source_id = b.source_id
    WHERE b.discovered_at >= ${since}::timestamptz
    GROUP BY b.source_id, b.source_name, b.category
  `);

  const counts: Record<string, Record<string, number>> = {};
  const totals = new Map<string, { id: string; name: string; total: number }>();
  const seenCategories = new Set<string>();
  for (const r of result) {
    (counts[r.source_id] ??= {})[r.category] = r.n;
    seenCategories.add(r.category);
    const t = totals.get(r.source_id) ?? { id: r.source_id, name: r.source_name, total: 0 };
    t.total += r.n;
    totals.set(r.source_id, t);
  }

  const share: Record<string, Record<string, number>> = {};
  for (const [id, { total }] of totals) {
    share[id] = Object.fromEntries(
      Object.entries(counts[id]).map(([category, n]) => [category, n / total])
    );
  }

  return {
    sources: [...totals.values()].sort((a, b) => b.total - a.total),
    // keep config order so columns don't jump around
    categories: CATEGORIES.map((c) => c.id).filter((id) => seenCategories.has(id)),
    share,
    counts,
  };
}

async function getRhythm(since: string): Promise<RhythmCell[]> {
  return rows<RhythmCell>(sql`
    SELECT EXTRACT(ISODOW FROM reported_at AT TIME ZONE ${RHYTHM_TIMEZONE})::int AS dow,
           EXTRACT(HOUR FROM reported_at AT TIME ZONE ${RHYTHM_TIMEZONE})::int AS hour,
           COUNT(*)::int AS count
    FROM analytics.article_base
    WHERE discovered_at >= ${since}::timestamptz
      AND reported_at IS NOT NULL
    GROUP BY 1, 2
  `);
}

// Scope share over time, counted per story (not per article).
async function getScopeShare(
  since: string,
  windowDays: number
): Promise<Insights["scopeShare"]> {
  const granularity = windowDays <= DAILY_BUCKETS_UP_TO ? "day" : "week";
  const scopes = SCOPES.filter((s) => !s.personal).map((s) => s.id);
  const result = await rows<{ bucket: string; scope: string; n: number }>(sql`
    SELECT DATE_TRUNC(${granularity}, first_discovered_at AT TIME ZONE 'UTC')::date::text AS bucket,
           scope,
           COUNT(*)::int AS n
    FROM analytics.cluster_facts
    WHERE first_discovered_at >= ${since}::timestamptz
    GROUP BY 1, 2
    ORDER BY 1
  `);

  const buckets = new Map<string, ScopeBucket>();
  for (const r of result) {
    const b = buckets.get(r.bucket) ?? { bucket: r.bucket, counts: {}, total: 0 };
    b.counts[r.scope] = r.n;
    b.total += r.n;
    buckets.set(r.bucket, b);
  }
  return { granularity, scopes, buckets: [...buckets.values()] };
}

// One row per source in the config, including ones with no articles yet.
async function getHealth(since: string, now: number): Promise<HealthRow[]> {
  const result = await rows<{
    source_id: string;
    discovery_method: string | null;
    articles: number;
    last_article_epoch: number | null;
    usable_time_rate: number | null;
    grounded_rate: number | null;
    median_words: number | null;
  }>(sql`
    SELECT s.id AS source_id,
           s.discovery_method,
           COUNT(b.article_id) FILTER (WHERE b.discovered_at >= ${since}::timestamptz)::int AS articles,
           -- epoch, because Date can't reliably parse postgres's "+00" offsets
           EXTRACT(EPOCH FROM MAX(b.discovered_at))::float8 AS last_article_epoch,
           AVG((b.time_quality = 'ok')::int)
             FILTER (WHERE b.discovered_at >= ${since}::timestamptz)::float8 AS usable_time_rate,
           AVG(b.grounded::int)
             FILTER (WHERE b.discovered_at >= ${since}::timestamptz)::float8 AS grounded_rate,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY b.word_count)
             FILTER (WHERE b.discovered_at >= ${since}::timestamptz)::float8 AS median_words
    FROM sources s
    LEFT JOIN analytics.article_base b ON b.source_id = s.id
    GROUP BY s.id, s.discovery_method
  `);
  const byId = new Map(result.map((r) => [r.source_id, r]));

  return SOURCES.map((source) => {
    const r = byId.get(source.id);
    const lastArticleMs = r?.last_article_epoch == null ? null : r.last_article_epoch * 1000;
    const lastArticleAt = lastArticleMs === null ? null : new Date(lastArticleMs).toISOString();
    const daysSilent = lastArticleMs === null ? null : (now - lastArticleMs) / 86_400_000;
    const status: HealthStatus =
      daysSilent === null
        ? "never"
        : daysSilent > SILENT_AFTER_DAYS
          ? "silent"
          : daysSilent > QUIET_AFTER_DAYS
            ? "quiet"
            : "ok";
    return {
      sourceId: source.id,
      sourceName: source.name,
      discoveryMethod: r?.discovery_method ?? null,
      articles: r?.articles ?? 0,
      lastArticleAt,
      daysSilent,
      status,
      usableTimeRate: r?.usable_time_rate ?? null,
      groundedRate: r?.grounded_rate ?? null,
      medianWords: r?.median_words ?? null,
    };
  }).sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.articles - a.articles);
}

const STATUS_ORDER: HealthStatus[] = ["never", "silent", "quiet", "ok"];
function statusRank(status: HealthStatus): number {
  return STATUS_ORDER.indexOf(status);
}
