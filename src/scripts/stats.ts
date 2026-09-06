import { db } from "@/lib/db/client";
import { articles, sources } from "@/lib/db/schema";
import { sql, eq, desc } from "drizzle-orm";

async function main() {
  const total = await db.select({ count: sql<number>`count(*)::int` }).from(articles);
  console.log("total articles:", total[0].count);

  console.log("\nby scope:");
  const byScope = await db
    .select({ scope: articles.scope, count: sql<number>`count(*)::int` })
    .from(articles)
    .groupBy(articles.scope)
    .orderBy(desc(sql`count(*)`));
  console.table(byScope);

  console.log("\nby category:");
  const byCategory = await db
    .select({ category: articles.category, count: sql<number>`count(*)::int` })
    .from(articles)
    .groupBy(articles.category)
    .orderBy(desc(sql`count(*)`));
  console.table(byCategory);

  console.log("\nby source (discovery method):");
  const bySource = await db
    .select({
      name: sources.name,
      method: sources.discoveryMethod,
      count: sql<number>`count(${articles.id})::int`,
    })
    .from(sources)
    .leftJoin(articles, eq(articles.sourceId, sources.id))
    .groupBy(sources.name, sources.discoveryMethod)
    .orderBy(desc(sql`count(${articles.id})`));
  console.table(bySource);

  const clusters = await db
    .select({ count: sql<number>`count(distinct ${articles.clusterId})::int` })
    .from(articles);
  console.log("distinct story clusters:", clusters[0].count);

  const multi = await db.execute(
    sql`select count(*)::int as c from (select cluster_id from articles group by cluster_id having count(*) > 1) t`
  );
  console.log("clusters with cross-source dedup (>1 article):", multi[0].c);

  process.exit(0);
}

main();
