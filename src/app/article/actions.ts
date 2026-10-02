"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articleReactions } from "@/lib/db/schema";
import { getVisitorId } from "@/lib/visitor";
import type { Interest } from "@/lib/reactions";

// Like / interest actions. Every query filters on the visitor id. With no
// cookie these do nothing.

function refresh() {
  revalidatePath("/[scope]", "page");
  revalidatePath("/article/[id]", "page");
}

export async function toggleLike(articleId: string): Promise<void> {
  const visitorId = await getVisitorId();
  if (!visitorId) return;

  const [existing] = await db
    .select({ liked: articleReactions.liked })
    .from(articleReactions)
    .where(
      and(eq(articleReactions.visitorId, visitorId), eq(articleReactions.articleId, articleId))
    )
    .limit(1);

  const liked = !existing?.liked;

  await db
    .insert(articleReactions)
    .values({ visitorId, articleId, liked })
    .onConflictDoUpdate({
      target: [articleReactions.visitorId, articleReactions.articleId],
      set: { liked },
    });

  refresh();
}

// Clicking the current value clears it.
export async function setInterest(articleId: string, interest: Interest): Promise<void> {
  const visitorId = await getVisitorId();
  if (!visitorId) return;

  const [existing] = await db
    .select({ interest: articleReactions.interest })
    .from(articleReactions)
    .where(
      and(eq(articleReactions.visitorId, visitorId), eq(articleReactions.articleId, articleId))
    )
    .limit(1);

  const next = existing?.interest === interest ? null : interest;

  await db
    .insert(articleReactions)
    .values({ visitorId, articleId, interest: next })
    .onConflictDoUpdate({
      target: [articleReactions.visitorId, articleReactions.articleId],
      set: { interest: next },
    });

  refresh();
  revalidatePath("/for-you");
}
