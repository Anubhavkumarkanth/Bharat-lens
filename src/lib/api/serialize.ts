import type { StoryCard } from "@/lib/query";
import type { ArticleDetail } from "@/lib/article";

/**
 * Public JSON shapes for the API.
 *
 * Kept separate from the internal row types on purpose: the API is a contract,
 * so dates become ISO strings, fields are named for consumers rather than for
 * the database, and internal-only values (rank score, baseline flags) are not
 * exposed. Changing a column never silently changes the API.
 */

export interface ArticleDTO {
  id: string;
  title: string;
  url: string;
  source: { id: string; name: string };
  byline: string | null;
  category: string;
  contentType: string;
  publishedAt: string | null;
  discoveredAt: string;
  isNew: boolean;
  summary: string | null;
  grounded: boolean;
  /** Other outlets reporting the same clustered story. */
  alsoReportedBy: { source: string; url: string }[];
}

export function toArticleDTO(card: StoryCard): ArticleDTO {
  return {
    id: card.id,
    title: card.title,
    url: card.canonicalUrl,
    source: { id: card.sourceId, name: card.sourceName },
    byline: card.byline,
    category: card.category,
    contentType: card.contentType,
    publishedAt: card.publishedAt ? card.publishedAt.toISOString() : null,
    discoveredAt: card.discoveredAt.toISOString(),
    isNew: card.isNew,
    summary: card.summaryEn,
    grounded: card.grounded,
    alsoReportedBy: card.otherOutlets.map((o) => ({ source: o.sourceName, url: o.url })),
  };
}

export interface ArticleDetailDTO extends Omit<ArticleDTO, "isNew" | "alsoReportedBy"> {
  sourceHomepage: string;
  wordCount: number;
  /** Full text is only served when the source permits republication. */
  fullText: string | null;
}

export function toArticleDetailDTO(a: ArticleDetail): ArticleDetailDTO {
  return {
    id: a.id,
    title: a.title,
    url: a.canonicalUrl,
    source: { id: a.sourceId, name: a.sourceName },
    sourceHomepage: a.sourceHomepage,
    byline: a.byline,
    category: a.category,
    contentType: a.contentType,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    discoveredAt: a.discoveredAt.toISOString(),
    summary: a.summaryEn,
    grounded: a.grounded,
    wordCount: a.wordCount,
    fullText: a.fullTextOk ? a.html : null,
  };
}
