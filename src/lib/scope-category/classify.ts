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

/**
 * Word-boundary matching. Plain substring matching silently wrecks the
 * classifier: "ai" hits "said"/"again"/"chair", "india" hits "Indiana".
 * Multi-word phrases match across any whitespace run.
 */
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

/**
 * Deterministic scope classifier.
 *
 * The publisher's section path is checked first: an Indian outlet's /world/
 * story belongs in World, not in the India tab.
 *
 * The important subtlety is that INDIA_KEYWORDS are useless for Indian sources
 * — those outlets mention India in nearly every story. Indian sources used to
 * be blanket-routed to "india" because of that, which starved the other two
 * scopes: twelve of seventeen sources are Indian, so India Abroad and Impact on
 * India could only ever be filled by foreign outlets and sat at 79 and 37
 * articles against India's 3,909. The diaspora and impact keyword sets are
 * specific enough to discriminate regardless of who published the story, so
 * every source is now routed by signal rather than by nationality.
 */
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

  // Whichever of the two specific signals is stronger wins, and a tie goes to
  // the diaspora. "Indian students hit by new visa rules abroad" matches both,
  // but it is a story about Indian students, not about India's economy — who
  // the story is about is the more concrete claim when both fire.
  const specific: Scope | null =
    abroadHits > 0 && abroadHits >= impactHits
      ? "india-abroad"
      : impactHits > 0
        ? "impact-on-india"
        : null;

  if (isForeignDesk) {
    if (specific) return specific;
    // A foreign outlet's world-desk story that is simply *about* India.
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

/**
 * Deterministic category classifier. The publisher's own section path is the
 * strongest signal, so it wins; headline keywords are the fallback. Only
 * articles with neither land in the general bucket.
 */
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
  // No section hint and no keyword matched. This has to be a bucket of its own:
  // it used to fall through to "business-economy", which put two thirds of the
  // corpus — crime, weather, accidents — under Business & Economy, and made that
  // filter useless for anyone actually looking for business news.
  return best.hits > 0 ? best.id : "general";
}

/** News report vs opinion/analysis, from the publisher's own section path. */
export function classifyContentType(url: string): "news-report" | "opinion" {
  return pathSegments(url).some((s) => OPINION_PATH_SEGMENTS.includes(s)) ? "opinion" : "news-report";
}
