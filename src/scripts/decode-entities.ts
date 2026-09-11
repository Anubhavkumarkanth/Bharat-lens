import { db } from "@/lib/db/client";
import { articles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decodeEntities } from "@/lib/ingestion/entities";

/**
 * Rewrites stored titles, excerpts and bylines through the entity decoder.
 *
 * Ingestion decodes at insert time, so this is only needed for rows captured
 * before that existed — or after adding a named entity to the table. Idempotent:
 * decoding already-decoded text is a no-op, so re-running is safe.
 */
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
    const title = decodeEntities(row.title);
    const excerpt = row.excerpt === null ? null : decodeEntities(row.excerpt);
    const byline = row.byline === null ? null : decodeEntities(row.byline);

    if (title !== row.title || excerpt !== row.excerpt || byline !== row.byline) {
      await db.update(articles).set({ title, excerpt, byline }).where(eq(articles.id, row.id));
      changed++;
    }
  }

  console.log(`decoded entities in ${changed} of ${rows.length} articles`);
  process.exit(0);
}

main();
