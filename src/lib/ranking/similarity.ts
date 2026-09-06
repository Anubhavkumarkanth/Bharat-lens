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

/** Same-story threshold for cross-source clustering — tuned conservative to avoid merging distinct stories. */
export const SAME_STORY_THRESHOLD = 0.45;
