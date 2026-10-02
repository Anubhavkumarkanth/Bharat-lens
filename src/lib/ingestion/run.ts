import { db } from "@/lib/db/client";
import { articles, sources, storyClusters } from "@/lib/db/schema";
import { eq, gte } from "drizzle-orm";
import { SOURCES, type SourceConfig } from "@/config/sources";
import { discoverFeed } from "./discovery";
import { fetchText } from "./http";
import { parseFeed, type FeedItem } from "./feed-parser";
import { fetchSitemapItems } from "./sitemap-parser";
import { canonicalizeUrl } from "./canonical";
import { classifyCategory, classifyContentType, classifyScope } from "@/lib/scope-category/classify";
import { titleTokens, jaccardSimilarity, SAME_STORY_THRESHOLD } from "@/lib/ranking/similarity";
import { summarizeArticle } from "@/lib/summarize";
import { normalizeText } from "./entities";

const MAX_SUMMARIZE_PER_SOURCE_RUN = 8; // keeps run time and AI cost down
const MAX_TITLE_FETCHES_PER_RUN = 40; // sitemaps without <news:title> cost one fetch per article

async function fetchPageTitle(url: string): Promise<string | null> {
  const html = await fetchText(url, 10000);
  if (!html) return null;
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html.slice(0, 20000));
  return match ? normalizeText(match[1]).trim() || null : null;
}

async function itemsFromSource(
  source: SourceConfig
): Promise<{ items: FeedItem[]; method: string; feedUrl: string } | null> {
  const discovered = await discoverFeed(source);
  if (!discovered) return null;

  if (discovered.type === "rss") {
    const xml = await fetchText(discovered.feedUrl);
    if (!xml) return null;
    return { items: parseFeed(xml), method: discovered.method, feedUrl: discovered.feedUrl };
  }

  // Sitemap entries without <news:title> need a fetch each to get the title, so
  // only the newest few are done per run. The rest get picked up later.
  const sitemapItems = await fetchSitemapItems(discovered.feedUrl);
  const withTitles = sitemapItems.filter((e) => e.title);
  const needTitle = sitemapItems.filter((e) => !e.title).slice(0, MAX_TITLE_FETCHES_PER_RUN);

  const items: FeedItem[] = withTitles.map((entry) => ({
    title: entry.title!,
    link: entry.loc,
    publishedAt: entry.lastmod,
    excerpt: null,
    byline: null,
  }));

  for (const entry of needTitle) {
    const title = await fetchPageTitle(entry.loc);
    if (!title) continue; // never fabricate a title
    items.push({ title, link: entry.loc, publishedAt: entry.lastmod, excerpt: null, byline: null });
  }

  return { items, method: discovered.method, feedUrl: discovered.feedUrl };
}

// Recent articles for clustering, loaded once per run and added to as we go.
// Querying for every insert was a 48h table scan each time.
interface ClusterCandidate {
  scope: string;
  sourceId: string;
  tokens: Set<string>;
  clusterId: string;
}

async function loadClusterCandidates(): Promise<ClusterCandidate[]> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recent = await db
    .select({
      title: articles.title,
      scope: articles.scope,
      sourceId: articles.sourceId,
      clusterId: articles.clusterId,
    })
    .from(articles)
    .where(gte(articles.discoveredAt, since));
  return recent.map((r) => ({
    scope: r.scope,
    sourceId: r.sourceId,
    tokens: titleTokens(r.title),
    clusterId: r.clusterId,
  }));
}

// An outlet can only be in a cluster once. Without this, AP's similar
// "Sportswatch Daily Listings" headlines merged 15 articles into one card.
async function findOrCreateCluster(
  candidates: ClusterCandidate[],
  scope: string,
  sourceId: string,
  title: string
): Promise<string> {
  const tokens = titleTokens(title);

  const clustersHoldingThisSource = new Set(
    candidates.filter((c) => c.sourceId === sourceId).map((c) => c.clusterId)
  );

  for (const candidate of candidates) {
    if (candidate.scope !== scope) continue;
    if (clustersHoldingThisSource.has(candidate.clusterId)) continue;
    if (jaccardSimilarity(tokens, candidate.tokens) >= SAME_STORY_THRESHOLD) {
      return candidate.clusterId;
    }
  }

  const id = crypto.randomUUID();
  await db.insert(storyClusters).values({ id });
  candidates.push({ scope, sourceId, tokens, clusterId: id });
  return id;
}

async function ingestSource(
  source: SourceConfig,
  clusterCandidates: ClusterCandidate[],
  deadline: number
): Promise<{ sourceId: string; inserted: number }> {
  const [dbSource] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, source.id))
    .limit(1);

  const isFirstScan = !dbSource?.baselineDone;

  // upsert the source row first (articles reference it)
  await db
    .insert(sources)
    .values({ ...source, baselineDone: dbSource?.baselineDone ?? false })
    .onConflictDoUpdate({
      target: sources.id,
      set: { name: source.name, homepage: source.homepage, country: source.country, kind: source.kind, priority: source.priority },
    });

  const result = await itemsFromSource(source);
  if (!result) {
    await db
      .update(sources)
      .set({ lastScannedAt: new Date(), discoveryMethod: null })
      .where(eq(sources.id, source.id));
    return { sourceId: source.id, inserted: 0 };
  }

  let inserted = 0;
  const toSummarize: { id: string; url: string; title: string }[] = [];

  for (const item of result.items) {
    if (!item.title || !item.link) continue;
    const canonicalUrl = canonicalizeUrl(item.link);

    const [existing] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.canonicalUrl, canonicalUrl))
      .limit(1);
    if (existing) continue; // already have this URL

    const scope = classifyScope(source, item.title, item.excerpt, canonicalUrl);
    const category = classifyCategory(item.title, item.excerpt, canonicalUrl);
    const contentType = classifyContentType(canonicalUrl);
    const clusterId = await findOrCreateCluster(clusterCandidates, scope, source.id, item.title);

    const id = crypto.randomUUID();
    await db.insert(articles).values({
      id,
      sourceId: source.id,
      canonicalUrl,
      title: item.title,
      byline: item.byline,
      publishedAt: item.publishedAt,
      scope,
      category,
      contentType,
      clusterId,
      isBaseline: isFirstScan,
      excerpt: item.excerpt,
    });
    inserted++;

    if (!isFirstScan && toSummarize.length < MAX_SUMMARIZE_PER_SOURCE_RUN) {
      toSummarize.push({ id, url: canonicalUrl, title: item.title });
    }
  }

  await db
    .update(sources)
    .set({
      resolvedFeedUrl: result.feedUrl,
      discoveryMethod: result.method,
      lastScannedAt: new Date(),
      baselineDone: true,
    })
    .where(eq(sources.id, source.id));

  // One at a time, and stop when out of time. This is the slowest part since
  // each one fetches the article.
  for (const item of toSummarize) {
    if (Date.now() > deadline) break;
    await summarizeArticle(item.id, item.url, item.title, source.name);
  }

  return { sourceId: source.id, inserted };
}

// Stop starting new work after this. Vercel Hobby kills functions at 300s and a
// full run takes much longer.
const DEFAULT_RUN_BUDGET_MS = 240_000;

// Least recently scanned first, so sources cut off by the deadline go first
// next time. A fixed order would never reach the end of the list.
async function sourcesByStaleness(): Promise<SourceConfig[]> {
  const scanned = await db
    .select({ id: sources.id, lastScannedAt: sources.lastScannedAt })
    .from(sources);
  const lastScan = new Map(scanned.map((r) => [r.id, r.lastScannedAt?.getTime() ?? 0]));

  // never scanned = 0, so new sources go first
  return [...SOURCES].sort((a, b) => (lastScan.get(a.id) ?? 0) - (lastScan.get(b.id) ?? 0));
}

export async function ingestAll(
  budgetMs: number = DEFAULT_RUN_BUDGET_MS
): Promise<{ sourceId: string; inserted: number; skipped?: boolean }[]> {
  const deadline = Date.now() + budgetMs;
  const results: { sourceId: string; inserted: number; skipped?: boolean }[] = [];
  const clusterCandidates = await loadClusterCandidates();

  for (const source of await sourcesByStaleness()) {
    if (Date.now() > deadline) {
      // listed in the response so timeouts are visible
      results.push({ sourceId: source.id, inserted: 0, skipped: true });
      continue;
    }
    try {
      results.push(await ingestSource(source, clusterCandidates, deadline));
    } catch (err) {
      console.error(`[ingest] ${source.id} failed:`, err);
      results.push({ sourceId: source.id, inserted: 0 });
    }
  }
  return results;
}
