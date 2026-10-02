import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articleReactions, articles } from "@/lib/db/schema";
import type { Category } from "@/config/taxonomy";

export type Interest = "interested" | "not-interested";

export interface Reaction {
  liked: boolean;
  interest: Interest | null;
}

export const NO_REACTION: Reaction = { liked: false, interest: null };

// Reactions for the articles on the page, in one query.
export async function getReactionsFor(
  visitorId: string,
  articleIds: string[]
): Promise<Map<string, Reaction>> {
  if (articleIds.length === 0) return new Map();

  const rows = await db
    .select({
      articleId: articleReactions.articleId,
      liked: articleReactions.liked,
      interest: articleReactions.interest,
    })
    .from(articleReactions)
    .where(
      and(eq(articleReactions.visitorId, visitorId), inArray(articleReactions.articleId, articleIds))
    );

  return new Map(
    rows.map((r) => [r.articleId, { liked: r.liked, interest: r.interest as Interest | null }])
  );
}

export interface InterestProfile {
  /** "Not interested" stories, removed from For You. */
  excludedArticleIds: string[];
  boostedCategories: Set<Category>;
  boostedSources: Set<string>;
}

// "Not interested" only hides that one story (not the whole category).
// "Interested" boosts the story's category and outlet.
export async function getInterestProfile(visitorId: string): Promise<InterestProfile> {
  const rows = await db
    .select({
      articleId: articleReactions.articleId,
      interest: articleReactions.interest,
      category: articles.category,
      sourceId: articles.sourceId,
    })
    .from(articleReactions)
    .innerJoin(articles, eq(articleReactions.articleId, articles.id))
    .where(eq(articleReactions.visitorId, visitorId));

  const profile: InterestProfile = {
    excludedArticleIds: [],
    boostedCategories: new Set(),
    boostedSources: new Set(),
  };

  for (const row of rows) {
    if (row.interest === "not-interested") profile.excludedArticleIds.push(row.articleId);
    else if (row.interest === "interested") {
      profile.boostedCategories.add(row.category as Category);
      profile.boostedSources.add(row.sourceId);
    }
  }

  return profile;
}
