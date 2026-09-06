import { db } from "@/lib/db/client";
import { articles, sources, storyClusters } from "@/lib/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { SOURCES, type SourceConfig } from "@/config/sources";
import { discoverFeed } from "./discovery";
import { fetchText } from "./http";
import { parseFeed, type FeedItem } from "./feed-parser";
import { fetchSitemapItems } from "./sitemap-parser";
import { canonicalizeUrl } from "./canonical";
import { classifyCategory, classifyContentType, classifyScope } from "@/lib/scope-category/classify";
import { titleTokens, jaccardSimilarity, SAME_STORY_THRESHOLD } from "@/lib/ranking/similarity";
import { summarizeArticle } from "@/lib/summarize";

const MAX_SUMMARIZE_PER_SOURCE_RUN = 8; // bounds cron execution time / AI spend per run
const MAX_TITLE_FETCHES_PER_RUN = 40; // sitemaps without <news:title> cost one fetch per article

async function fetchPageTitle(url: string): Promise<string | null> {
  const html = await fetchText(url, 10000);
  if (!html) return null;
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html.slice(0, 20000));
  return match ? match[1].trim() : null;
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

  // Sitemap path: entries may lack a title (no <news:title>) — resolve via a cheap
  // <title> fetch. That's one request per article, so only the newest slice is
  // resolved per run; the rest are picked up on later runs as they stay in the sitemap.
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

/**
 * In-memory clustering candidates for one ingestion run. Loaded once up front
 * and appended to as articles are inserted — querying per article turned every
 * insert into a full 48h scan of the table.
 */
interface ClusterCandidate {
  scope: string;
  tokens: Set<string>;
  clusterId: string;
}

async function loadClusterCandidates(): Promise<ClusterCandidate[]> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recent = await db
    .select({ title: articles.title, scope: articles.scope, clusterId: articles.clusterId })
    .from(articles)
    .where(gte(articles.discoveredAt, since));
  return recent.map((r) => ({ scope: r.scope, tokens: titleTokens(r.title), clusterId: r.clusterId }));
}

async function findOrCreateCluster(
  candidates: ClusterCandidate[],
  scope: string,
  title: string
): Promise<string> {
  const tokens = titleTokens(title);
  for (const candidate of candidates) {
    if (candidate.scope !== scope) continue;
    if (jaccardSimilarity(tokens, candidate.tokens) >= SAME_STORY_THRESHOLD) {
      return candidate.clusterId;
    }
  }

  const id = crypto.randomUUID();
  await db.insert(storyClusters).values({ id });
  candidates.push({ scope, tokens, clusterId: id });
  return id;
}

async function ingestSource(
  source: SourceConfig,
  clusterCandidates: ClusterCandidate[]
): Promise<{ sourceId: string; inserted: number }> {
  const [dbSource] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, source.id))
    .limit(1);

  const isFirstScan = !dbSource?.baselineDone;

  // The source row must exist before any article can reference it (FK), so
  // upsert its config now and record scan state at the end of the run.
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
    if (existing) continue; // already ingested this exact story from this URL

    const scope = classifyScope(source, item.title, item.excerpt, canonicalUrl);
    const category = classifyCategory(item.title, item.excerpt, canonicalUrl);
    const contentType = classifyContentType(canonicalUrl);
    const clusterId = await findOrCreateCluster(clusterCandidates, scope, item.title);

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

  // Summarize sequentially to stay within a predictable, boundable request budget per source.
  for (const item of toSummarize) {
    await summarizeArticle(item.id, item.url, item.title, source.name);
  }

  return { sourceId: source.id, inserted };
}

export async function ingestAll(): Promise<{ sourceId: string; inserted: number }[]> {
  const results: { sourceId: string; inserted: number }[] = [];
  const clusterCandidates = await loadClusterCandidates();
  for (const source of SOURCES) {
    try {
      results.push(await ingestSource(source, clusterCandidates));
    } catch (err) {
      console.error(`[ingest] ${source.id} failed:`, err);
      results.push({ sourceId: source.id, inserted: 0 });
    }
  }
  return results;
}
