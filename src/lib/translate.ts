import { db } from "@/lib/db/client";
import { articleSummaries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAiProvider } from "@/lib/ai/provider";

/**
 * Lazy, cache-once Hindi translation: only called when a viewer in Hindi
 * mode actually requests this article, and only ever runs the AI call once
 * per article — subsequent requests are served from article_summaries.summary_hi.
 */
export async function getOrTranslateSummary(articleId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(articleSummaries)
    .where(eq(articleSummaries.articleId, articleId))
    .limit(1);

  if (!row?.summaryEn) return null; // nothing grounded to translate
  if (row.summaryHi) return row.summaryHi;

  const ai = getAiProvider();
  if (!ai) return null;

  const summaryHi = await ai.translateToHindi(row.summaryEn);
  if (!summaryHi) return null;

  await db
    .update(articleSummaries)
    .set({ summaryHi, translatedAt: new Date() })
    .where(eq(articleSummaries.articleId, articleId));

  return summaryHi;
}
