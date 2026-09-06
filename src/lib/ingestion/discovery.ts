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
  // Look only at the first chunk — <head> is always near the top, and homepages can be large.
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

  // A declared feed link can still serve HTML (e.g. ThePrint's /web-stories/feed/),
  // so verify each candidate actually returns a feed before accepting it.
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
  // Prefer a news-specific sitemap when one is advertised — it's already recency-bounded.
  // Match on the URL *path* only: a hostname like "ptinews.com" would otherwise make
  // every sitemap on the domain look news-specific.
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

/**
 * Feed discovery cascade: explicit override -> <head> metadata -> common
 * RSS paths -> sitemap via robots.txt. A blocked/failed step never stops
 * the cascade; it just falls through to the next strategy.
 */
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
