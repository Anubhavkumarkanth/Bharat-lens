import { db } from "@/lib/db/client";
import { articles, storyClusters } from "@/lib/db/schema";
import { asc, eq, notInArray } from "drizzle-orm";
import { titleTokens, jaccardSimilarity, SAME_STORY_THRESHOLD } from "@/lib/ranking/similarity";

// Rebuilds story clusters for stored articles, using the same rules as ingestion
// (oldest first, 48h window, one article per outlet). Run after changing clustering.
const WINDOW_MS = 48 * 60 * 60 * 1000;

interface Candidate {
  scope: string;
  sourceId: string;
  tokens: Set<string>;
  clusterId: string;
  discoveredAt: number;
}

async function main() {
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      scope: articles.scope,
      sourceId: articles.sourceId,
      clusterId: articles.clusterId,
      discoveredAt: articles.discoveredAt,
    })
    .from(articles)
    .orderBy(asc(articles.discoveredAt));

  console.log(`reclustering ${rows.length} articles`);

  let candidates: Candidate[] = [];
  const assignments = new Map<string, string>();
  const createdClusterIds: string[] = [];

  for (const row of rows) {
    const at = row.discoveredAt.getTime();
    // same 48h window as ingestion
    candidates = candidates.filter((c) => at - c.discoveredAt <= WINDOW_MS);

    const tokens = titleTokens(row.title);
    const held = new Set(
      candidates.filter((c) => c.sourceId === row.sourceId).map((c) => c.clusterId)
    );

    let clusterId: string | null = null;
    for (const candidate of candidates) {
      if (candidate.scope !== row.scope) continue;
      if (held.has(candidate.clusterId)) continue;
      if (jaccardSimilarity(tokens, candidate.tokens) >= SAME_STORY_THRESHOLD) {
        clusterId = candidate.clusterId;
        break;
      }
    }

    if (!clusterId) {
      clusterId = crypto.randomUUID();
      createdClusterIds.push(clusterId);
    }

    assignments.set(row.id, clusterId);
    candidates.push({
      scope: row.scope,
      sourceId: row.sourceId,
      tokens,
      clusterId,
      discoveredAt: at,
    });
  }

  // insert clusters before updating articles (foreign key)
  for (let i = 0; i < createdClusterIds.length; i += 500) {
    await db
      .insert(storyClusters)
      .values(createdClusterIds.slice(i, i + 500).map((id) => ({ id })))
      .onConflictDoNothing();
  }

  let moved = 0;
  for (const row of rows) {
    const next = assignments.get(row.id);
    if (next && next !== row.clusterId) {
      await db.update(articles).set({ clusterId: next }).where(eq(articles.id, row.id));
      moved++;
    }
  }

  // delete clusters with no articles left
  const live = [...new Set(assignments.values())];
  const orphans = await db
    .delete(storyClusters)
    .where(notInArray(storyClusters.id, live))
    .returning({ id: storyClusters.id });

  console.log(
    `moved ${moved} articles into ${new Set(assignments.values()).size} clusters, ` +
      `removed ${orphans.length} empty ones`
  );
  process.exit(0);
}

main();
