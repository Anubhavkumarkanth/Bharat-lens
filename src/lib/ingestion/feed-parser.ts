import { XMLParser } from "fast-xml-parser";
import { normalizeText } from "./entities";

export interface FeedItem {
  title: string;
  link: string;
  publishedAt: Date | null;
  excerpt: string | null;
  byline: string | null;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return normalizeText(value).trim() || null;
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return normalizeText(String((value as Record<string, unknown>)["#text"])).trim() || null;
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  const text = textOf(value);
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parses RSS 2.0 or Atom XML into a flat list of items. Returns [] on malformed XML rather than throwing. */
export function parseFeed(xml: string): FeedItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }

  const rss = doc.rss as Record<string, unknown> | undefined;
  if (rss?.channel) {
    const channel = rss.channel as Record<string, unknown>;
    return asArray(channel.item as Record<string, unknown> | Record<string, unknown>[]).map((item) => {
      const link = textOf(item.link) ?? textOf((item as Record<string, unknown>)["@_href"]);
      return {
        title: textOf(item.title) ?? "",
        link: link ?? "",
        publishedAt: parseDate(item.pubDate ?? item["dc:date"]),
        excerpt: textOf(item.description) ?? textOf(item["content:encoded"]),
        byline: textOf(item.author) ?? textOf(item["dc:creator"]),
      };
    });
  }

  const feed = doc.feed as Record<string, unknown> | undefined;
  if (feed?.entry) {
    return asArray(feed.entry as Record<string, unknown> | Record<string, unknown>[]).map((entry) => {
      const linkField = entry.link as
        | { "@_href"?: string }
        | { "@_href"?: string }[]
        | undefined;
      const links = asArray(linkField);
      const link = links.find((l) => !("@_rel" in l) || (l as Record<string, unknown>)["@_rel"] === "alternate");
      return {
        title: textOf(entry.title) ?? "",
        link: link?.["@_href"] ?? "",
        publishedAt: parseDate(entry.published ?? entry.updated),
        excerpt: textOf(entry.summary) ?? textOf(entry.content),
        byline: textOf((entry.author as Record<string, unknown> | undefined)?.name),
      };
    });
  }

  return [];
}
