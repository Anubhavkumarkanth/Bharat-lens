"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articleReactions, reposts } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ensureProfile } from "@/lib/profiles";
import type { Interest } from "@/lib/reactions";

/**
 * Engagement actions. Like and interest are per (user, article) and upserted;
 * every WHERE is scoped to the session-verified user id, since the app connects
 * as the DB owner and RLS does not apply.
 */

function refresh() {
  revalidatePath("/[scope]", "page");
  revalidatePath("/article/[id]", "page");
}

export async function toggleLike(articleId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const [existing] = await db
    .select({ liked: articleReactions.liked })
    .from(articleReactions)
    .where(and(eq(articleReactions.userId, user.id), eq(articleReactions.articleId, articleId)))
    .limit(1);

  const liked = !existing?.liked;

  await db
    .insert(articleReactions)
    .values({ userId: user.id, articleId, liked })
    .onConflictDoUpdate({
      target: [articleReactions.userId, articleReactions.articleId],
      set: { liked },
    });

  refresh();
}

/** Passing the interest already set clears it, so the buttons toggle. */
export async function setInterest(articleId: string, interest: Interest): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const [existing] = await db
    .select({ interest: articleReactions.interest })
    .from(articleReactions)
    .where(and(eq(articleReactions.userId, user.id), eq(articleReactions.articleId, articleId)))
    .limit(1);

  const next = existing?.interest === interest ? null : interest;

  await db
    .insert(articleReactions)
    .values({ userId: user.id, articleId, interest: next })
    .onConflictDoUpdate({
      target: [articleReactions.userId, articleReactions.articleId],
      set: { interest: next },
    });

  refresh();
  revalidatePath("/for-you");
}

/**
 * Reposting is a public act — it puts the story on the reposter's profile page,
 * which is why a profile is created here if they don't have one yet.
 */
export async function toggleRepost(articleId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const [existing] = await db
    .select({ id: reposts.id })
    .from(reposts)
    .where(and(eq(reposts.userId, user.id), eq(reposts.articleId, articleId)))
    .limit(1);

  if (existing) {
    await db.delete(reposts).where(eq(reposts.id, existing.id));
  } else {
    const profile = await ensureProfile(user.id, user.email);
    await db.insert(reposts).values({ id: crypto.randomUUID(), userId: user.id, articleId });
    revalidatePath(`/u/${profile.handle}`);
  }

  refresh();
}
