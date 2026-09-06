export interface RankableArticle {
  id: string;
  sourcePriority: number;
  publishedAt: Date | null;
  discoveredAt: Date;
  title: string;
  sourceId: string;
}

const RECENCY_HALF_LIFE_HOURS = 18;

function recencyScore(article: RankableArticle, now: number): number {
  const anchor = (article.publishedAt ?? article.discoveredAt).getTime();
  const ageHours = Math.max(0, (now - anchor) / 3_600_000);
  return Math.pow(0.5, ageHours / RECENCY_HALF_LIFE_HOURS); // 1.0 fresh, decays toward 0
}

/**
 * Layer 1 deterministic score: source priority + recency decay. Dedup and
 * clustering happen upstream (canonical URL + story cluster assignment);
 * this only scores the already-deduped candidate set. Source-diversity is
 * enforced by the caller (selectDailyQueue) since it depends on the whole batch.
 */
export function scoreArticle(article: RankableArticle, now = Date.now()): number {
  const recency = recencyScore(article, now);
  const priority = article.sourcePriority / 10; // normalize ~0-1
  return recency * 0.65 + priority * 0.35;
}

/**
 * Bounds the broad candidate pool down to the configurable daily display
 * target, enforcing source diversity (no single source dominates the queue).
 */
export function selectDailyQueue<T extends RankableArticle>(
  candidates: T[],
  dailyTarget: number,
  maxPerSource = Math.max(2, Math.ceil(dailyTarget / 4))
): T[] {
  const now = Date.now();
  const ranked = [...candidates].sort((a, b) => scoreArticle(b, now) - scoreArticle(a, now));

  const perSourceCount = new Map<string, number>();
  const selected: T[] = [];

  for (const article of ranked) {
    const count = perSourceCount.get(article.sourceId) ?? 0;
    if (count >= maxPerSource) continue;
    selected.push(article);
    perSourceCount.set(article.sourceId, count + 1);
    if (selected.length >= dailyTarget) break;
  }

  // Backfill if diversity cap left the queue short of target.
  if (selected.length < dailyTarget) {
    for (const article of ranked) {
      if (selected.includes(article)) continue;
      selected.push(article);
      if (selected.length >= dailyTarget) break;
    }
  }

  return selected;
}
