import { db } from "@/lib/db/client";
import { articleSummaries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAiProvider } from "@/lib/ai/provider";

// Hindi translation, done the first time someone needs it and then cached in summary_hi.
export async function getOrTranslateSummary(articleId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(articleSummaries)
    .where(eq(articleSummaries.articleId, articleId))
    .limit(1);

  if (!row?.summaryEn) return null; // no summary to translate
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
