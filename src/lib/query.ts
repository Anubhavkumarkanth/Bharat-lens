import { db } from "@/lib/db/client";
import { articles, articleSummaries, sources } from "@/lib/db/schema";
import { and, desc, eq, gte, lt, asc, inArray, notInArray, sql } from "drizzle-orm";
import type { Category, Scope } from "@/config/taxonomy";
import { scoreArticle, selectDailyQueue, type RankableArticle } from "@/lib/ranking/deterministic";

export type SortOption = "newest" | "trending" | "popular" | "oldest";
export type RangeOption = "live" | "1d" | "week" | "month" | "past-month" | "year";

export interface QueryArticlesParams {
  /** One scope, or several — the For You feed draws from every scope the reader picked. */
  scope: Scope | Scope[];
  /** One category, or several. Omitted or empty means no category filter. */
  category?: Category | Category[];
  sort?: SortOption;
  range?: RangeOption;
  limit?: number;
  /** Stories the reader marked "not interested". Excluded before selection, so
   *  a rejected story doesn't take up one of the day's slots. */
  excludeArticleIds?: string[];
  /** YYYY-MM-DD from the month timeline. Overrides `range` when set. */
  day?: string;
  /** 1-based. The diversity cap is applied to the whole span up to this page,
   *  then sliced, so paging deeper cannot let one outlet take over page 3. */
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

/** Cards per feed page. Exported so the page can tell a full page (probably
 *  more behind it) from a short one (definitely the end). */
export const PAGE_SIZE = 40;
const SEARCH_LIMIT = 60;

/** One place defining what a card needs, so search and the feed cannot drift apart. */
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

/** Written out rather than derived from CARD_COLUMNS: drizzle's column type
 *  carries the data type but not its nullability, so a mapped type quietly
 *  makes every nullable column non-null. */
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

/**
 * Collapses rows into one card per story cluster, keeping the highest-priority
 * article as primary and every other outlet in the cluster alongside it.
 * Preserves the order clusters were first seen in, so a caller that sorted by
 * relevance keeps that order.
 */
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

/**
 * Full-text search across every scope and the whole corpus.
 *
 * Deliberately ignores the reader's scope, category and time filters: a search
 * box that only looks inside today's India feed is not a search box. Ranked by
 * relevance first, then recency, and the day-queue diversity cap is skipped —
 * that exists to stop one outlet dominating a browse feed, but when someone
 * searches for a story they want the matches, not a balanced sample.
 */
export async function searchArticles(query: string, now: number): Promise<StoryCard[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // Must match the expression on articles_search_idx exactly, or Postgres
  // cannot use the GIN index. websearch_to_tsquery handles quoted phrases,
  // OR and leading - the way people expect a search box to behave.
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

  // An empty scope list would match every row rather than none, so bail early.
  if (scopes.length === 0) return [];

  // A day pinned on the timeline replaces the rolling range entirely — the
  // reader asked for that date, not "the last 24 hours ending on it".
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
    .limit(1500); // broad candidate pool; clustered and trimmed below

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

  // Order the whole candidate set once, with a fixed per-source cap, then slice
  // the requested page out of it.
  //
  // Selecting only as much as the current page needs looks equivalent and is
  // not: selectDailyQueue derives its per-source cap from the target size, so
  // asking for 40 caps a source at 10 while asking for 80 caps it at 20. The two
  // selections are then different lists rather than one being a prefix of the
  // other, and pages overlap — seven stories appeared on both page 1 and page 2.
  // A cap tied to PAGE_SIZE keeps every page a slice of the same ordering.
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
    // "trending" and "popular" both use the deterministic score as a proxy until
    // real view-count tracking lands (Phase 2/3) — see project README.
    ordered.sort((a, b) => scoreArticle(b, now) - scoreArticle(a, now));
  }

  const start = (Math.max(1, page) - 1) * limit;
  return ordered
    .slice(start, start + limit)
    .map((r) => byId.get(r.id)!)
    .filter(Boolean);
}
