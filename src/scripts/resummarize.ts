import { db } from "@/lib/db/client";
import { articleSummaries, articles, sources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { summarizeArticle } from "@/lib/summarize";

/**
 * Re-runs summarization over already-ingested rows. Needed whenever the summary
 * prompt or the provider changes — rule 4 caches by article and never
 * re-summarizes, so stored rows would otherwise keep the old wording forever.
 *
 * Clears the cached row first so summarizeArticle's "already grounded" guard
 * doesn't skip it. Costs one model call per article: pass a limit while testing.
 */
async function main() {
  const limit = Number(process.argv[2]) || 20;

  const rows = await db
    .select({
      id: articles.id,
      canonicalUrl: articles.canonicalUrl,
      title: articles.title,
      sourceName: sources.name,
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .limit(limit);

  let done = 0;
  for (const row of rows) {
    await db.delete(articleSummaries).where(eq(articleSummaries.articleId, row.id));
    await summarizeArticle(row.id, row.canonicalUrl, row.title, row.sourceName);
    done++;
  }

  console.log(`re-summarized ${done} articles`);
  process.exit(0);
}

main();
