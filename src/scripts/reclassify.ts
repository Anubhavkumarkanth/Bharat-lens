import { db } from "@/lib/db/client";
import { articles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SOURCES } from "@/config/sources";
import { classifyCategory, classifyContentType, classifyScope } from "@/lib/scope-category/classify";

/**
 * Re-runs scope/category classification over already-ingested rows. Needed
 * whenever the taxonomy keywords or the classifier logic change — ingestion
 * classifies once at insert time, so stored rows would otherwise keep old labels.
 */
async function main() {
  const rows = await db
    .select({
      id: articles.id,
      sourceId: articles.sourceId,
      title: articles.title,
      excerpt: articles.excerpt,
      canonicalUrl: articles.canonicalUrl,
      scope: articles.scope,
      category: articles.category,
      contentType: articles.contentType,
    })
    .from(articles);

  let changed = 0;
  for (const row of rows) {
    const source = SOURCES.find((s) => s.id === row.sourceId);
    if (!source) continue;
    const scope = classifyScope(source, row.title, row.excerpt, row.canonicalUrl);
    const category = classifyCategory(row.title, row.excerpt, row.canonicalUrl);
    const contentType = classifyContentType(row.canonicalUrl);
    if (scope !== row.scope || category !== row.category || contentType !== row.contentType) {
      await db.update(articles).set({ scope, category, contentType }).where(eq(articles.id, row.id));
      changed++;
    }
  }

  console.log(`reclassified ${changed} of ${rows.length} articles`);
  process.exit(0);
}

main();
