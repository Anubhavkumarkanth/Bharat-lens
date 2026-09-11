import { db } from "@/lib/db/client";
import { articleContent, articleSummaries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { extractArticleText } from "@/lib/ingestion/extract";
import { getAiProvider } from "@/lib/ai/provider";

/**
 * Grounded summarization, cached by article id (== canonical URL identity).
 * Absolute rule: never summarize from the headline alone. If article text
 * can't be retrieved, or no AI provider is configured, we persist a
 * "not grounded" row so the UI falls back to headline + source link only —
 * and so we don't keep retrying the same failing fetch every cron run.
 */
export async function summarizeArticle(
  articleId: string,
  canonicalUrl: string,
  title: string,
  sourceName: string
): Promise<void> {
  const [existing] = await db
    .select()
    .from(articleSummaries)
    .where(eq(articleSummaries.articleId, articleId))
    .limit(1);
  if (existing?.grounded) return; // already summarized — never re-summarize

  const extracted = await extractArticleText(canonicalUrl);

  // Persist the extraction the summary is grounded in, so the in-app reader
  // doesn't re-fetch the publisher on every view (rule 6: readers read the DB).
  // Whether any of it is rendered is decided per source by `fullTextOk`.
  if (extracted) {
    const content = {
      articleId,
      html: extracted.html,
      textContent: extracted.textContent,
      wordCount: extracted.textContent.split(/\s+/).length,
      extractedAt: new Date(),
    };
    await db
      .insert(articleContent)
      .values(content)
      .onConflictDoUpdate({ target: articleContent.articleId, set: content });
  }

  const ai = extracted ? getAiProvider() : null;
  const summaryEn = ai && extracted ? await ai.summarize({ title, sourceText: extracted.textContent, sourceName }) : null;

  const row = {
    articleId,
    summaryEn: summaryEn ?? null,
    grounded: Boolean(summaryEn),
    modelUsed: summaryEn ? process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001" : null,
    generatedAt: summaryEn ? new Date() : null,
  };

  await db
    .insert(articleSummaries)
    .values(row)
    .onConflictDoUpdate({ target: articleSummaries.articleId, set: row });
}
