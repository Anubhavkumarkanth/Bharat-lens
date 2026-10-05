import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

/**
 * Lightweight corpus and ingestion statistics, computed with plain aggregate
 * queries rather than the analytics views — so these endpoints work on any
 * database the schema has been pushed to, and stay fast enough to serve live.
 *
 * The data-quality fields are the point of the project: dupSourceClusters is a
 * monitorable invariant (an outlet must appear in a cluster at most once), so a
 * non-zero value is a visible signal that clustering has regressed.
 */

export interface CorpusStats {
  totalArticles: number;
  totalStories: number;          // distinct clusters
  multiOutletStories: number;    // clusters reported by >1 source
  activeSources: number;
  groundedRate: number;          // share of articles with a grounded summary
  dupSourceClusters: number;     // data-quality invariant: must be 0
  byScope: { scope: string; count: number }[];
  byCategory: { category: string; count: number }[];
}

export async function getCorpusStats(): Promise<CorpusStats> {
  const [[totals], byScope, byCategory, [quality]] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total_articles,
        COUNT(DISTINCT cluster_id)::int AS total_stories,
        COUNT(DISTINCT source_id)::int AS active_sources
      FROM articles
    `) as unknown as [{ total_articles: number; total_stories: number; active_sources: number }],
    db.execute(sql`SELECT scope, COUNT(*)::int AS count FROM articles GROUP BY scope ORDER BY count DESC`) as unknown as { scope: string; count: number }[],
    db.execute(sql`SELECT category, COUNT(*)::int AS count FROM articles GROUP BY category ORDER BY count DESC`) as unknown as { category: string; count: number }[],
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM (
           SELECT cluster_id FROM articles GROUP BY cluster_id HAVING COUNT(DISTINCT source_id) > 1
         ) m) AS multi_outlet,
        (SELECT COUNT(*)::int FROM (
           SELECT cluster_id, source_id FROM articles GROUP BY cluster_id, source_id HAVING COUNT(*) > 1
         ) d) AS dup_source,
        COALESCE(AVG((s.grounded)::int), 0)::float8 AS grounded_rate
      FROM articles a
      LEFT JOIN article_summaries s ON s.article_id = a.id
    `) as unknown as [{ multi_outlet: number; dup_source: number; grounded_rate: number }],
  ]);

  return {
    totalArticles: totals.total_articles,
    totalStories: totals.total_stories,
    multiOutletStories: quality.multi_outlet,
    activeSources: totals.active_sources,
    groundedRate: Number(quality.grounded_rate.toFixed(4)),
    dupSourceClusters: quality.dup_source,
    byScope,
    byCategory,
  };
}

export interface SourceHealth {
  id: string;
  name: string;
  country: string;
  kind: string;
  discoveryMethod: string | null;
  lastScannedAt: string | null;
  articleCount: number;
}

/** Per-source ingestion health: how each feed was discovered and how much it yields. */
export async function getSourceHealth(): Promise<SourceHealth[]> {
  const rows = (await db.execute(sql`
    SELECT s.id, s.name, s.country, s.kind, s.discovery_method,
           s.last_scanned_at, COUNT(a.id)::int AS article_count
    FROM sources s
    LEFT JOIN articles a ON a.source_id = s.id
    GROUP BY s.id, s.name, s.country, s.kind, s.discovery_method, s.last_scanned_at
    ORDER BY article_count DESC
  `)) as unknown as {
    id: string; name: string; country: string; kind: string;
    discovery_method: string | null; last_scanned_at: Date | null; article_count: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    kind: r.kind,
    discoveryMethod: r.discovery_method,
    lastScannedAt: r.last_scanned_at ? new Date(r.last_scanned_at).toISOString() : null,
    articleCount: r.article_count,
  }));
}
