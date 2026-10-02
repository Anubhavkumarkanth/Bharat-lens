import type { SourceConfig } from "@/config/sources";
import {
  CATEGORIES,
  CATEGORY_PATH_HINTS,
  IMPACT_ON_INDIA_KEYWORDS,
  INDIA_ABROAD_KEYWORDS,
  INDIA_KEYWORDS,
  OPINION_PATH_SEGMENTS,
  WORLD_SECTION_SEGMENTS,
  type Category,
  type Scope,
} from "@/config/taxonomy";

const patternCache = new Map<string, RegExp>();

// Whole-word matching. Substrings broke things ("ai" in "said", "india" in "Indiana").
function keywordPattern(keyword: string): RegExp {
  const cached = patternCache.get(keyword);
  if (cached) return cached;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
  patternCache.set(keyword, pattern);
  return pattern;
}

function countKeywordHits(haystack: string, keywords: string[]): number {
  let hits = 0;
  for (const kw of keywords) {
    if (keywordPattern(kw).test(haystack)) hits++;
  }
  return hits;
}

// Picks the scope. /world/ URLs go to World first. After that it's keywords,
// the same for every source. (Indian sources used to all go to "india", which
// left India Abroad and Impact on India nearly empty.)
export function classifyScope(
  source: SourceConfig,
  title: string,
  excerpt: string | null,
  url?: string
): Scope {
  const text = `${title} ${excerpt ?? ""}`.toLowerCase();
  const indiaHits = countKeywordHits(text, INDIA_KEYWORDS);
  const impactHits = countKeywordHits(text, IMPACT_ON_INDIA_KEYWORDS);
  const abroadHits = countKeywordHits(text, INDIA_ABROAD_KEYWORDS);

  const isForeignDesk =
    url !== undefined &&
    pathSegments(url).some((s) => WORLD_SECTION_SEGMENTS.includes(s));

  // Stronger match wins, ties go to India Abroad ("Indian students hit by new
  // visa rules" is about the students).
  const specific: Scope | null =
    abroadHits > 0 && abroadHits >= impactHits
      ? "india-abroad"
      : impactHits > 0
        ? "impact-on-india"
        : null;

  if (isForeignDesk) {
    if (specific) return specific;
    // foreign outlet writing about India
    if (indiaHits > 0 && source.country !== "IN") return "india-abroad";
    return "world";
  }

  if (source.country === "IN") return specific ?? "india";

  if (specific) return specific;
  return indiaHits > 0 ? "india-abroad" : "world";
}

function pathSegments(url: string): string[] {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  } catch {
    return [];
  }
}

// Picks the category: URL section first, then keywords, else general.
export function classifyCategory(title: string, excerpt: string | null, url?: string): Category {
  if (url) {
    for (const segment of pathSegments(url)) {
      const hinted = CATEGORY_PATH_HINTS[segment];
      if (hinted) return hinted;
    }
  }

  const text = `${title} ${excerpt ?? ""}`.toLowerCase();
  let best: { id: Category; hits: number } = { id: CATEGORIES[0].id, hits: 0 };
  for (const cat of CATEGORIES) {
    const hits = countKeywordHits(text, cat.keywords);
    if (hits > best.hits) best = { id: cat.id, hits };
  }
  // nothing matched (used to default to business, which made that filter useless)
  return best.hits > 0 ? best.id : "general";
}

// News or opinion, based on the URL.
export function classifyContentType(url: string): "news-report" | "opinion" {
  return pathSegments(url).some((s) => OPINION_PATH_SEGMENTS.includes(s)) ? "opinion" : "news-report";
}
