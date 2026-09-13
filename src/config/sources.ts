/**
 * Editable source list. The ingestion pipeline never hardcodes a source —
 * it only reads this file. Add/remove/reprioritize sources here.
 *
 * `feedUrl` is an explicit override (cascade step 1). Leave it unset to let
 * the discovery cascade find a feed via <head> metadata, common paths, or
 * sitemaps — see src/lib/ingestion/discovery.ts.
 *
 * Verified 2026-09-06 (see project notes): PTI, ANI, Reuters, AP, and
 * The Print expose no public RSS and must go through sitemap discovery.
 * Scroll's feed lives on Feedburner, not on scroll.in itself.
 */

export type SourceCountry = "IN" | "GLOBAL";
export type SourceKind = "wire" | "newspaper";

export interface SourceConfig {
  id: string;
  name: string;
  homepage: string;
  country: SourceCountry;
  kind: SourceKind;
  /** Explicit feed URL, skips discovery. Omit to rely on the cascade. */
  feedUrl?: string;
  /** Higher = trusted more in deterministic ranking and dedup tie-breaks. */
  priority: number;
  /**
   * Whether the in-app reader may render this source's FULL article text.
   *
   * Deliberately false (omitted) for every source shipped here. Full text is
   * stored for all of them — extraction already runs to ground summaries — but
   * storing is not publishing. None of these outlets grants republication
   * rights: wires (PTI, ANI, Reuters, AP, AFP, Bloomberg) enforce hardest, and
   * the papers and broadcasters all prohibit it in their terms too.
   *
   * Set this to true only for a source you have written permission or a licence
   * for, or your own publication. Everything left false renders a lead-in plus
   * the summary, then hands the reader to the publisher — see /article/[id].
   */
  fullTextOk?: boolean;
}

export const SOURCES: SourceConfig[] = [
  // --- Wire services ---
  // PTI's news sitemap index has been stale since 2026-08-26 and their main sitemap is a
  // static 2023 site map, so this yields nothing today. Kept configured deliberately: it
  // costs one request per run and starts working again the moment PTI resumes publishing.
  { id: "pti", name: "PTI", homepage: "https://www.ptinews.com", country: "IN", kind: "wire", priority: 9 },
  { id: "ani", name: "ANI", homepage: "https://www.aninews.in", country: "IN", kind: "wire", priority: 9 },
  { id: "reuters", name: "Reuters", homepage: "https://www.reuters.com", country: "GLOBAL", kind: "wire", priority: 10 },
  { id: "ap", name: "AP", homepage: "https://apnews.com", country: "GLOBAL", kind: "wire", priority: 10 },
  { id: "afp", name: "AFP", homepage: "https://www.afp.com", country: "GLOBAL", kind: "wire", feedUrl: "https://www.afp.com/en/rss.xml", priority: 9 },

  // --- Indian newspapers ---
  { id: "the-hindu", name: "The Hindu", homepage: "https://www.thehindu.com", country: "IN", kind: "newspaper", feedUrl: "https://www.thehindu.com/news/national/feeder/default.rss", priority: 8 },
  { id: "indian-express", name: "Indian Express", homepage: "https://indianexpress.com", country: "IN", kind: "newspaper", feedUrl: "https://indianexpress.com/feed/", priority: 8 },
  { id: "livemint", name: "Livemint", homepage: "https://www.livemint.com", country: "IN", kind: "newspaper", feedUrl: "https://www.livemint.com/rss/news", priority: 7 },
  { id: "business-standard", name: "Business Standard", homepage: "https://www.business-standard.com", country: "IN", kind: "newspaper", feedUrl: "https://www.business-standard.com/rss/latest.rss", priority: 7 },
  { id: "economic-times", name: "Economic Times", homepage: "https://economictimes.indiatimes.com", country: "IN", kind: "newspaper", feedUrl: "https://economictimes.indiatimes.com/rssfeedsdefault.cms", priority: 7 },
  { id: "hindustan-times", name: "Hindustan Times", homepage: "https://www.hindustantimes.com", country: "IN", kind: "newspaper", feedUrl: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", priority: 7 },
  { id: "scroll", name: "Scroll", homepage: "https://scroll.in", country: "IN", kind: "newspaper", feedUrl: "https://feeds.feedburner.com/ScrollinArticles.rss", priority: 6 },
  { id: "the-print", name: "The Print", homepage: "https://theprint.in", country: "IN", kind: "newspaper", priority: 6 },

  // --- Global outlets ---
  { id: "bbc", name: "BBC", homepage: "https://www.bbc.com/news", country: "GLOBAL", kind: "newspaper", feedUrl: "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml", priority: 8 },
  { id: "guardian", name: "The Guardian", homepage: "https://www.theguardian.com", country: "GLOBAL", kind: "newspaper", feedUrl: "https://www.theguardian.com/world/india/rss", priority: 7 },
  { id: "bloomberg", name: "Bloomberg", homepage: "https://www.bloomberg.com", country: "GLOBAL", kind: "newspaper", feedUrl: "https://feeds.bloomberg.com/markets/news.rss", priority: 7 },
  { id: "al-jazeera", name: "Al Jazeera", homepage: "https://www.aljazeera.com", country: "GLOBAL", kind: "newspaper", feedUrl: "https://www.aljazeera.com/xml/rss/all.xml", priority: 7 },

  // --- Indian print & digital, added to widen coverage ---
  // Most are left without an explicit feedUrl on purpose: the discovery cascade
  // finds them, and a wrong hardcoded URL is worse than no URL at all.
  { id: "times-of-india", name: "Times of India", homepage: "https://timesofindia.indiatimes.com", country: "IN", kind: "newspaper", feedUrl: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms", priority: 7 },
  { id: "new-indian-express", name: "New Indian Express", homepage: "https://www.newindianexpress.com", country: "IN", kind: "newspaper", priority: 6 },
  { id: "telegraph-india", name: "The Telegraph India", homepage: "https://www.telegraphindia.com", country: "IN", kind: "newspaper", priority: 6 },
  { id: "deccan-herald", name: "Deccan Herald", homepage: "https://www.deccanherald.com", country: "IN", kind: "newspaper", priority: 6 },
  { id: "tribune-india", name: "The Tribune", homepage: "https://www.tribuneindia.com", country: "IN", kind: "newspaper", priority: 6 },
  { id: "deccan-chronicle", name: "Deccan Chronicle", homepage: "https://www.deccanchronicle.com", country: "IN", kind: "newspaper", priority: 5 },
  { id: "the-wire", name: "The Wire", homepage: "https://thewire.in", country: "IN", kind: "newspaper", priority: 6 },
  { id: "firstpost", name: "Firstpost", homepage: "https://www.firstpost.com", country: "IN", kind: "newspaper", priority: 5 },
  { id: "moneycontrol", name: "Moneycontrol", homepage: "https://www.moneycontrol.com", country: "IN", kind: "newspaper", priority: 6 },
  { id: "financial-express", name: "Financial Express", homepage: "https://www.financialexpress.com", country: "IN", kind: "newspaper", priority: 6 },
  { id: "businessline", name: "The Hindu BusinessLine", homepage: "https://www.thehindubusinessline.com", country: "IN", kind: "newspaper", priority: 6 },
  { id: "outlook-india", name: "Outlook India", homepage: "https://www.outlookindia.com", country: "IN", kind: "newspaper", priority: 5 },

  // --- Global print & wire, for World and Impact-on-India ---
  // Broadcasters are deliberately absent: rule 7 is print and wire only.
  { id: "nikkei-asia", name: "Nikkei Asia", homepage: "https://asia.nikkei.com", country: "GLOBAL", kind: "newspaper", priority: 7 },
  { id: "scmp", name: "South China Morning Post", homepage: "https://www.scmp.com", country: "GLOBAL", kind: "newspaper", priority: 6 },
  { id: "straits-times", name: "The Straits Times", homepage: "https://www.straitstimes.com", country: "GLOBAL", kind: "newspaper", priority: 6 },
  { id: "dawn", name: "Dawn", homepage: "https://www.dawn.com", country: "GLOBAL", kind: "newspaper", priority: 6 },
  { id: "arab-news", name: "Arab News", homepage: "https://www.arabnews.com", country: "GLOBAL", kind: "newspaper", priority: 5 },
  { id: "the-national", name: "The National", homepage: "https://www.thenationalnews.com", country: "GLOBAL", kind: "newspaper", priority: 5 },
];
