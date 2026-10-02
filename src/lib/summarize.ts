import { db } from "@/lib/db/client";
import { articleContent, articleSummaries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { extractArticleText } from "@/lib/ingestion/extract";
import { getAiProvider } from "@/lib/ai/provider";

// Summarizes from the article text only, never from the headline. If there's no
// text or no AI key, saves grounded=false so the card shows headline + link and
// we don't retry every run.
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
  if (existing?.grounded) return; // already done

  const extracted = await extractArticleText(canonicalUrl);

  // store the text for the reader so pages never fetch from the publisher
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
