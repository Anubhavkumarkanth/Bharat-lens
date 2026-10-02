// All news sources. Ingestion only reads this list.
//
// feedUrl is optional. Without it, discovery.ts looks for a feed in <head>,
// common paths, then sitemaps. As of 2026-09-06, PTI, ANI, Reuters, AP and
// The Print have no public RSS and come in through sitemaps. Scroll's feed is
// on Feedburner.

export type SourceCountry = "IN" | "GLOBAL";
export type SourceKind = "wire" | "newspaper";

export interface SourceConfig {
  id: string;
  name: string;
  homepage: string;
  country: SourceCountry;
  kind: SourceKind;
  /** Feed URL. Leave out to use discovery. */
  feedUrl?: string;
  /** Higher = preferred in ranking and when picking a cluster's main article. */
  priority: number;
  /**
   * Can the reader show the full article? Off for every source, since none of
   * them allow republishing. Only turn on with written permission. When off,
   * the reader shows the opening and links to the publisher.
   */
  fullTextOk?: boolean;
}

export const SOURCES: SourceConfig[] = [
  // --- Wire services ---
  // PTI's sitemap went stale on 2026-08-26 and came back on 2026-09-13. Keep it
  // even when it returns nothing, it only costs one request.
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

  // --- More Indian outlets ---
  // Most have no feedUrl and go through discovery.
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

  // --- More international outlets (print and wire only, no TV) ---
  { id: "nikkei-asia", name: "Nikkei Asia", homepage: "https://asia.nikkei.com", country: "GLOBAL", kind: "newspaper", priority: 7 },
  { id: "scmp", name: "South China Morning Post", homepage: "https://www.scmp.com", country: "GLOBAL", kind: "newspaper", priority: 6 },
  { id: "straits-times", name: "The Straits Times", homepage: "https://www.straitstimes.com", country: "GLOBAL", kind: "newspaper", priority: 6 },
  { id: "dawn", name: "Dawn", homepage: "https://www.dawn.com", country: "GLOBAL", kind: "newspaper", priority: 6 },
  { id: "arab-news", name: "Arab News", homepage: "https://www.arabnews.com", country: "GLOBAL", kind: "newspaper", priority: 5 },
  { id: "the-national", name: "The National", homepage: "https://www.thenationalnews.com", country: "GLOBAL", kind: "newspaper", priority: 5 },
];
