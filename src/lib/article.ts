import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articleContent, articleSummaries, articles, sources } from "@/lib/db/schema";
import { SOURCES } from "@/config/sources";
import type { Category } from "@/config/taxonomy";

export interface ArticleDetail {
  id: string;
  title: string;
  byline: string | null;
  canonicalUrl: string;
  sourceId: string;
  sourceName: string;
  sourceHomepage: string;
  publishedAt: Date | null;
  discoveredAt: Date;
  category: Category;
  contentType: string;
  summaryEn: string | null;
  grounded: boolean;
  html: string | null;
  wordCount: number;
  /** Can we show the full text for this source? */
  fullTextOk: boolean;
}

export async function getArticleDetail(id: string): Promise<ArticleDetail | null> {
  const [row] = await db
    .select({
      id: articles.id,
      title: articles.title,
      byline: articles.byline,
      canonicalUrl: articles.canonicalUrl,
      sourceId: articles.sourceId,
      sourceName: sources.name,
      sourceHomepage: sources.homepage,
      publishedAt: articles.publishedAt,
      discoveredAt: articles.discoveredAt,
      category: articles.category,
      contentType: articles.contentType,
      summaryEn: articleSummaries.summaryEn,
      grounded: articleSummaries.grounded,
      html: articleContent.html,
      wordCount: articleContent.wordCount,
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .leftJoin(articleSummaries, eq(articles.id, articleSummaries.articleId))
    .leftJoin(articleContent, eq(articles.id, articleContent.articleId))
    .where(eq(articles.id, id))
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    category: row.category as Category,
    grounded: row.grounded ?? false,
    wordCount: row.wordCount ?? 0,
    // from config, so turning it off is a one-line change
    fullTextOk: SOURCES.find((s) => s.id === row.sourceId)?.fullTextOk === true,
  };
}
