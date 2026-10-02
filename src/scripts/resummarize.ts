import { db } from "@/lib/db/client";
import { articleSummaries, articles, sources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { summarizeArticle } from "@/lib/summarize";

// Redoes summaries for stored articles, e.g. after changing the prompt.
// Deletes the cached summary first. One AI call per article, so use a limit when testing.
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
