import { XMLParser } from "fast-xml-parser";
import { fetchText } from "./http";
import { decodeEntities } from "./entities";

export interface SitemapUrlEntry {
  loc: string;
  lastmod: Date | null;
  title: string | null; // from <news:title> when present (Google News sitemap extension)
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return decodeEntities(value).trim() || null;
  return null;
}

function parseLastmod(value: unknown): Date | null {
  const text = textOf(value);
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MAX_SITEMAPS_TO_FOLLOW = 5;
const MAX_URLS = 500;
const MAX_ARTICLE_AGE_DAYS = 7;

/**
 * Fetches and recursively resolves a sitemap (or sitemap index) into a
 * bounded, recency-filtered list of article URLs. Google News sitemaps are
 * already limited to ~2 days of content, but we defensively cap depth,
 * count, and age for arbitrary/general sitemaps too.
 */
export async function fetchSitemapItems(url: string, depth = 0): Promise<SitemapUrlEntry[]> {
  if (depth > 2) return [];
  const xml = await fetchText(url);
  if (!xml) return [];

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }

  const index = doc.sitemapindex as Record<string, unknown> | undefined;
  if (index?.sitemap) {
    const children = asArray(index.sitemap as Record<string, unknown> | Record<string, unknown>[]);
    // Newest-looking children first: sort by lastmod desc when present.
    const sorted = [...children].sort((a, b) => {
      const da = parseLastmod(a.lastmod)?.getTime() ?? 0;
      const db = parseLastmod(b.lastmod)?.getTime() ?? 0;
      return db - da;
    });
    const results: SitemapUrlEntry[] = [];
    for (const child of sorted.slice(0, MAX_SITEMAPS_TO_FOLLOW)) {
      const loc = textOf(child.loc);
      if (!loc) continue;
      const childItems = await fetchSitemapItems(loc, depth + 1);
      results.push(...childItems);
      if (results.length >= MAX_URLS) break;
    }
    return results.slice(0, MAX_URLS);
  }

  const urlset = doc.urlset as Record<string, unknown> | undefined;
  if (urlset?.url) {
    const cutoff = Date.now() - MAX_ARTICLE_AGE_DAYS * 24 * 60 * 60 * 1000;
    const urls = asArray(urlset.url as Record<string, unknown> | Record<string, unknown>[]);
    const items: SitemapUrlEntry[] = urls
      .map((u): SitemapUrlEntry | null => {
        const loc = textOf(u.loc);
        if (!loc) return null;
        const news = u["news:news"] as Record<string, unknown> | undefined;
        const newsPub = news?.["news:publication_date"];
        const lastmod = parseLastmod(u.lastmod) ?? parseLastmod(newsPub);
        const title = textOf(news?.["news:title"]);
        return { loc, lastmod, title };
      })
      .filter((x): x is SitemapUrlEntry => x !== null)
      // Keep undated entries too (discovery cascade / baseline logic decides how to treat them),
      // but drop anything explicitly dated older than the cutoff.
      .filter((x) => x.lastmod === null || x.lastmod.getTime() >= cutoff);
    return items.slice(0, MAX_URLS);
  }

  return [];
}
