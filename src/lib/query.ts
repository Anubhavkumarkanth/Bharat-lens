import { db } from "@/lib/db/client";
import { articles, articleSummaries, sources } from "@/lib/db/schema";
import { and, desc, eq, gte, lt, asc, inArray, notInArray, sql } from "drizzle-orm";
import type { Category, Scope } from "@/config/taxonomy";
import { scoreArticle, selectDailyQueue, type RankableArticle } from "@/lib/ranking/deterministic";

export type SortOption = "newest" | "trending" | "popular" | "oldest";
export type RangeOption = "live" | "1d" | "week" | "month" | "past-month" | "year";

export interface QueryArticlesParams {
  /** One scope, or several (For You uses all the reader's scopes). */
  scope: Scope | Scope[];
  /** One category, or several. Omitted or empty means no category filter. */
  category?: Category | Category[];
  sort?: SortOption;
  range?: RangeOption;
  limit?: number;
  /** Stories marked "not interested". Removed before selection so they don't use up a slot. */
  excludeArticleIds?: string[];
  /** YYYY-MM-DD from the month timeline. Overrides `range` when set. */
  day?: string;
  /** 1-based. The source cap is applied to everything up to this page, then sliced. */
  page?: number;
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

/** Cards per page. Exported so the page can tell if there's a next page. */
export const PAGE_SIZE = 40;
const SEARCH_LIMIT = 60;

/** Columns a card needs. Shared by search and the feed. */
const CARD_COLUMNS = {
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
} as const;

// Written out by hand because a type mapped from CARD_COLUMNS loses nullability.
interface CardRow {
  id: string;
  clusterId: string;
  title: string;
  canonicalUrl: string;
  sourceId: string;
  sourceName: string;
  sourcePriority: number;
  byline: string | null;
  publishedAt: Date | null;
  discoveredAt: Date;
  category: string;
  contentType: string;
  isBaseline: boolean;
  excerpt: string | null;
  summaryEn: string | null;
  grounded: boolean | null;
}

// One card per cluster. The highest-priority article is the main one and the
// rest are listed as other outlets. Keeps the incoming order.
function toCards(rows: CardRow[], now: number): StoryCard[] {
  const byCluster = new Map<string, CardRow[]>();
  for (const row of rows) {
    const bucket = byCluster.get(row.clusterId) ?? [];
    bucket.push(row);
    byCluster.set(row.clusterId, bucket);
  }

  return [...byCluster.values()].map((bucket) => {
    const sorted = [...bucket].sort((a, b) => b.sourcePriority - a.sourcePriority);
    const primary = sorted[0];
    return {
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
  });
}

// Full-text search over everything. Ignores scope/category/date filters and the
// per-source cap on purpose. Sorted by relevance, then date.
export async function searchArticles(query: string, now: number): Promise<StoryCard[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // Has to match the articles_search_idx expression exactly or the index isn't used.
  const document = sql`to_tsvector('english', ${articles.title} || ' ' || coalesce(${articles.excerpt}, ''))`;
  const tsquery = sql`websearch_to_tsquery('english', ${trimmed})`;

  const rows = await db
    .select(CARD_COLUMNS)
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .leftJoin(articleSummaries, eq(articles.id, articleSummaries.articleId))
    .where(sql`${document} @@ ${tsquery}`)
    .orderBy(desc(sql`ts_rank(${document}, ${tsquery})`), desc(articles.discoveredAt))
    .limit(SEARCH_LIMIT);

  return toCards(rows, now);
}

export async function queryArticles(params: QueryArticlesParams): Promise<StoryCard[]> {
  const {
    scope,
    category,
    sort = "newest",
    range = "1d",
    limit = PAGE_SIZE,
    excludeArticleIds = [],
    day,
    page = 1,
  } = params;

  const scopes = Array.isArray(scope) ? scope : [scope];
  const categories = category === undefined ? [] : Array.isArray(category) ? category : [category];

  // empty scope list would match everything
  if (scopes.length === 0) return [];

  // a day picked on the timeline replaces the range
  const dayStart = day ? new Date(`${day}T00:00:00.000Z`) : null;
  const validDay = dayStart && !Number.isNaN(dayStart.getTime()) ? dayStart : null;
  const dayEnd = validDay ? new Date(validDay.getTime() + 24 * 60 * 60 * 1000) : null;

  const conditions = [
    inArray(articles.scope, scopes),
    validDay
      ? gte(articles.discoveredAt, validDay)
      : gte(articles.discoveredAt, rangeStart(range)),
  ];
  if (validDay && dayEnd) conditions.push(lt(articles.discoveredAt, dayEnd));
  if (categories.length > 0) conditions.push(inArray(articles.category, categories));
  if (excludeArticleIds.length > 0) conditions.push(notInArray(articles.id, excludeArticleIds));

  const rows = await db
    .select({
      ...CARD_COLUMNS,
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .leftJoin(articleSummaries, eq(articles.id, articleSummaries.articleId))
    .where(and(...conditions))
    .orderBy(sort === "oldest" ? asc(articles.discoveredAt) : desc(articles.discoveredAt))
    .limit(1500); // candidates, trimmed below

  // one card per cluster
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

  // Select first (with the per-source cap), then sort. See ARCHITECTURE.md.
  const byId = new Map(scored.map((s) => [s.rankable.id, s.card]));

  // Order everything once with a cap based on PAGE_SIZE, then slice out the page.
  // Selecting per page changed the cap per page and stories showed up on two pages.
  const rankables = scored.map((s) => s.rankable);
  const selected = selectDailyQueue(
    rankables,
    rankables.length,
    Math.max(2, Math.ceil(PAGE_SIZE / 4))
  );

  const ordered = [...selected];
  if (sort === "newest" || sort === "oldest") {
    ordered.sort((a, b) => {
      const at = (a.publishedAt ?? a.discoveredAt).getTime();
      const bt = (b.publishedAt ?? b.discoveredAt).getTime();
      return sort === "oldest" ? at - bt : bt - at;
    });
  } else {
    // no view tracking yet, so trending/popular use the ranking score
    ordered.sort((a, b) => scoreArticle(b, now) - scoreArticle(a, now));
  }

  const start = (Math.max(1, page) - 1) * limit;
  return ordered
    .slice(start, start + limit)
    .map((r) => byId.get(r.id)!)
    .filter(Boolean);
}
