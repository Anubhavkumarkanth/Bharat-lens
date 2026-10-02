import { db } from "@/lib/db/client";
import { articles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { normalizeText } from "@/lib/ingestion/entities";

// Fixes HTML entities in already stored titles, excerpts and bylines.
// Ingestion does this now, so it's only for old rows. Safe to run twice.
async function main() {
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      excerpt: articles.excerpt,
      byline: articles.byline,
    })
    .from(articles);

  let changed = 0;
  for (const row of rows) {
    const title = normalizeText(row.title);
    const excerpt = row.excerpt === null ? null : normalizeText(row.excerpt);
    const byline = row.byline === null ? null : normalizeText(row.byline);

    if (title !== row.title || excerpt !== row.excerpt || byline !== row.byline) {
      await db.update(articles).set({ title, excerpt, byline }).where(eq(articles.id, row.id));
      changed++;
    }
  }

  console.log(`decoded entities in ${changed} of ${rows.length} articles`);
  process.exit(0);
}

main();
