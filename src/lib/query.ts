import { db } from "@/lib/db/client";
import { articles, articleSummaries, sources } from "@/lib/db/schema";
import { and, desc, eq, gte, asc } from "drizzle-orm";
import type { Category, Scope } from "@/config/taxonomy";
import { scoreArticle, selectDailyQueue, type RankableArticle } from "@/lib/ranking/deterministic";

export type SortOption = "newest" | "trending" | "popular" | "oldest";
export type RangeOption = "live" | "1d" | "week" | "month" | "past-month" | "year";

export interface QueryArticlesParams {
  scope: Scope;
  category?: Category;
  sort?: SortOption;
  range?: RangeOption;
  limit?: number;
}

export interface ReportingOutlet {
  sourceName: string;
  url: string;
}

export interface StoryCard {
  clusterId: string;
  id: string;
  title: string;
  canonicalUrl: string;
  sourceId: string;
  sourceName: string;
  byline: string | null;
  publishedAt: Date | null;
  discoveredAt: Date;
  category: Category;
  contentType: string;
  isBaseline: boolean;
  isNew: boolean; // discovered recently and not part of a first-scan baseline
  excerpt: string | null;
  summaryEn: string | null;
  grounded: boolean;
  otherOutlets: ReportingOutlet[]; // other sources reporting the same story
}

const NEW_BADGE_WINDOW_MS = 2 * 60 * 60 * 1000;

function rangeStart(range: RangeOption): Date {
  const now = new Date();
  switch (range) {
    case "live":
      return new Date(now.getTime() - 6 * 60 * 60 * 1000);
    case "1d":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "past-month":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "year":
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
}

const DEFAULT_DAILY_TARGET = 30;

export async function queryArticles(params: QueryArticlesParams): Promise<StoryCard[]> {
  const { scope, category, sort = "newest", range = "1d", limit = DEFAULT_DAILY_TARGET } = params;

  const conditions = [eq(articles.scope, scope), gte(articles.discoveredAt, rangeStart(range))];
  if (category) conditions.push(eq(articles.category, category));

  const rows = await db
    .select({
      id: articles.id,
      clusterId: articles.clusterId,
      title: articles.title,
      canonicalUrl: articles.canonicalUrl,
      sourceId: articles.sourceId,
      sourceName: sources.name,
      sourcePriority: sources.priority,
      byline: articles.byline,
      publishedAt: articles.publishedAt,
      discoveredAt: articles.discoveredAt,
      category: articles.category,
      contentType: articles.contentType,
      isBaseline: articles.isBaseline,
      excerpt: articles.excerpt,
      summaryEn: articleSummaries.summaryEn,
      grounded: articleSummaries.grounded,
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .leftJoin(articleSummaries, eq(articles.id, articleSummaries.articleId))
    .where(and(...conditions))
    .orderBy(sort === "oldest" ? asc(articles.discoveredAt) : desc(articles.discoveredAt))
    .limit(500); // broad candidate pool; trimmed to `limit` below

  // Group into one card per story cluster, keeping the highest-priority article as primary
  // and every other source in the cluster as an "other outlet" for the compare view.
  const byCluster = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = byCluster.get(row.clusterId) ?? [];
    bucket.push(row);
    byCluster.set(row.clusterId, bucket);
  }

  const now = Date.now();
  const scored: { card: StoryCard; rankable: RankableArticle }[] = [];
  for (const bucket of byCluster.values()) {
    const sorted = [...bucket].sort((a, b) => b.sourcePriority - a.sourcePriority);
    const primary = sorted[0];
    const card: StoryCard = {
      clusterId: primary.clusterId,
      id: primary.id,
      title: primary.title,
      canonicalUrl: primary.canonicalUrl,
      sourceId: primary.sourceId,
      sourceName: primary.sourceName,
      byline: primary.byline,
      publishedAt: primary.publishedAt,
      discoveredAt: primary.discoveredAt,
      category: primary.category as Category,
      contentType: primary.contentType,
      isBaseline: primary.isBaseline,
      isNew: !primary.isBaseline && now - primary.discoveredAt.getTime() < NEW_BADGE_WINDOW_MS,
      excerpt: primary.excerpt,
      summaryEn: primary.summaryEn,
      grounded: primary.grounded ?? false,
      otherOutlets: sorted.slice(1).map((r) => ({ sourceName: r.sourceName, url: r.canonicalUrl })),
    };
    scored.push({
      card,
      rankable: {
        id: primary.id,
        sourcePriority: primary.sourcePriority,
        publishedAt: primary.publishedAt,
        discoveredAt: primary.discoveredAt,
        title: primary.title,
        sourceId: primary.sourceId,
      },
    });
  }

  // Two distinct steps, per the ranking model: first *select* the day's queue
  // from the broad candidate pool with the source-diversity cap applied (so one
  // prolific outlet can't wall off a scope), then *order* that queue by whatever
  // the reader asked for.
  const byId = new Map(scored.map((s) => [s.rankable.id, s.card]));
  const selected = selectDailyQueue(
    scored.map((s) => s.rankable),
    limit
  );

  const ordered = [...selected];
  if (sort === "newest" || sort === "oldest") {
    ordered.sort((a, b) => {
      const at = (a.publishedAt ?? a.discoveredAt).getTime();
      const bt = (b.publishedAt ?? b.discoveredAt).getTime();
      return sort === "oldest" ? at - bt : bt - at;
    });
  } else {
    // "trending" and "popular" both use the deterministic score as a proxy until
    // real view-count tracking lands (Phase 2/3) — see project README.
    ordered.sort((a, b) => scoreArticle(b, now) - scoreArticle(a, now));
  }

  return ordered.map((r) => byId.get(r.id)!).filter(Boolean);
}
