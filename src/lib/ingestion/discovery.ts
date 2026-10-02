import type { SourceConfig } from "@/config/sources";
import { fetchText } from "./http";
import { fetchRobots } from "./robots";

export type DiscoveryMethod = "explicit" | "head-meta" | "common-path" | "sitemap";

export interface DiscoveryResult {
  feedUrl: string;
  method: DiscoveryMethod;
  type: "rss" | "sitemap";
}

const COMMON_FEED_PATHS = ["/feed", "/rss", "/atom.xml", "/feed.xml", "/rss.xml"];

function looksLikeXmlFeed(body: string): boolean {
  const head = body.slice(0, 500).toLowerCase();
  return head.includes("<rss") || head.includes("<feed") || head.includes("<?xml");
}

async function tryHeadMetadata(homepage: string): Promise<DiscoveryResult | null> {
  const html = await fetchText(homepage);
  if (!html) return null;
  // only need the start of the page for <head>
  const head = html.slice(0, 20000);
  const linkRegex =
    /<link[^>]+type=["'](application\/rss\+xml|application\/atom\+xml)["'][^>]*>/gi;

  const candidates: string[] = [];
  for (const match of head.matchAll(linkRegex)) {
    const hrefMatch = /href=["']([^"']+)["']/i.exec(match[0]);
    if (!hrefMatch) continue;
    try {
      candidates.push(new URL(hrefMatch[1], homepage).toString());
    } catch {
      // skip malformed href
    }
  }

  // some feed links return HTML (e.g. ThePrint's /web-stories/feed/), so check each one
  for (const feedUrl of candidates) {
    const body = await fetchText(feedUrl);
    if (body && looksLikeXmlFeed(body)) {
      return { feedUrl, method: "head-meta", type: "rss" };
    }
  }
  return null;
}

async function tryCommonPaths(homepage: string): Promise<DiscoveryResult | null> {
  for (const path of COMMON_FEED_PATHS) {
    const url = new URL(path, homepage).toString();
    const body = await fetchText(url);
    if (body && looksLikeXmlFeed(body)) {
      return { feedUrl: url, method: "common-path", type: "rss" };
    }
  }
  return null;
}

async function trySitemap(homepage: string): Promise<DiscoveryResult | null> {
  const robots = await fetchRobots(homepage);
  if (robots.sitemaps.length === 0) return null;
  // Prefer a news sitemap. Only check the path, since "ptinews.com" contains "news".
  const newsSitemap = robots.sitemaps.find((s) => {
    try {
      return /news/i.test(new URL(s).pathname);
    } catch {
      return false;
    }
  });
  const chosen = newsSitemap ?? robots.sitemaps[0];
  return { feedUrl: chosen, method: "sitemap", type: "sitemap" };
}

// Finds a feed: config URL, then <head> links, then common RSS paths, then
// sitemaps from robots.txt. If one step fails it tries the next.
export async function discoverFeed(source: SourceConfig): Promise<DiscoveryResult | null> {
  if (source.feedUrl) {
    return { feedUrl: source.feedUrl, method: "explicit", type: "rss" };
  }
  return (
    (await tryHeadMetadata(source.homepage).catch(() => null)) ??
    (await tryCommonPaths(source.homepage).catch(() => null)) ??
    (await trySitemap(source.homepage).catch(() => null))
  );
}
