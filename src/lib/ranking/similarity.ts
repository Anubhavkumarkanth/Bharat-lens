const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "have", "has", "will",
  "after", "over", "into", "amid", "amidst", "says", "said", "its", "his",
  "her", "their", "are", "was", "were", "been", "not", "but", "who", "what",
  "when", "how", "why",
]);

export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  );
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Similarity needed to count as the same story. Kept high so different stories don't merge.
export const SAME_STORY_THRESHOLD = 0.45;

/**
 * A candidate article already placed in a cluster: enough to decide whether a
 * new article joins it. The same shape works for live ingestion and for a
 * rebuild over stored rows.
 */
export interface ClusterCandidate {
  scope: string;
  sourceId: string;
  tokens: Set<string>;
  clusterId: string;
}

/**
 * The clustering decision, as one pure function so ingestion and the rebuild
 * script cannot drift apart. Returns the id of the cluster the article joins,
 * or null if it should start a new one.
 *
 * Two rules, in order:
 *   1. An outlet appears in a cluster at most once. A publisher re-filing the
 *      same story under a new URL must not pile into one card, and title
 *      similarity alone would let it — "Teenager has hand blown off" matches
 *      "Student, 15, has hand blown off". Clusters the source already occupies
 *      are skipped.
 *   2. Among the rest in the same scope, join the first above the similarity
 *      threshold.
 *
 * The caller records the placement by pushing a candidate for the chosen
 * cluster — on BOTH the join and the create path. Omitting it on the join path
 * was the original bug: the guard then only knew about sources that created
 * clusters, not ones that joined them, so an outlet's re-filings still merged.
 */
export function chooseCluster(
  candidates: ClusterCandidate[],
  article: { scope: string; sourceId: string; tokens: Set<string> }
): string | null {
  const clustersHoldingThisSource = new Set(
    candidates.filter((c) => c.sourceId === article.sourceId).map((c) => c.clusterId)
  );

  for (const candidate of candidates) {
    if (candidate.scope !== article.scope) continue;
    if (clustersHoldingThisSource.has(candidate.clusterId)) continue;
    if (jaccardSimilarity(article.tokens, candidate.tokens) >= SAME_STORY_THRESHOLD) {
      return candidate.clusterId;
    }
  }
  return null;
}
