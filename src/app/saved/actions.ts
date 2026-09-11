"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { collections, savedArticles } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getLang } from "@/lib/lang";
import { t } from "@/config/ui-strings";

/**
 * Every mutation below scopes its WHERE clause to the session-verified user id.
 * That is the only thing standing between one reader's rows and another's — the
 * app connects to Postgres as the owning role, which bypasses RLS — so a row id
 * arriving from a form is never trusted on its own.
 */

export interface SavedFormState {
  error?: string;
}

function refresh() {
  revalidatePath("/saved");
  revalidatePath("/[scope]", "page");
}

/** Card-level toggle: saves an article, or removes it if this reader already had it. */
export async function toggleSave(articleId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const [existing] = await db
    .select({ id: savedArticles.id })
    .from(savedArticles)
    .where(and(eq(savedArticles.userId, user.id), eq(savedArticles.articleId, articleId)))
    .limit(1);

  if (existing) {
    await db.delete(savedArticles).where(eq(savedArticles.id, existing.id));
  } else {
    await db.insert(savedArticles).values({
      id: crypto.randomUUID(),
      userId: user.id,
      articleId,
    });
  }

  refresh();
}

export async function createCollection(
  _prev: SavedFormState,
  formData: FormData
): Promise<SavedFormState> {
  const lang = await getLang();
  const user = await getCurrentUser();
  if (!user) return { error: t("auth.signInToContinue", lang) };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return {};

  // A duplicate name is the reader re-creating a folder they already have;
  // the unique index makes that a no-op rather than an error page.
  await db
    .insert(collections)
    .values({ id: crypto.randomUUID(), userId: user.id, name })
    .onConflictDoNothing();

  refresh();
  return {};
}

export async function deleteCollection(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const id = String(formData.get("collectionId") ?? "");
  // Saved rows survive: collection_id is ON DELETE SET NULL, so the articles
  // fall back to "no collection" rather than disappearing with the folder.
  await db.delete(collections).where(and(eq(collections.id, id), eq(collections.userId, user.id)));

  refresh();
}

/** Note, due date and collection are edited together from one row-level form. */
export async function updateSavedItem(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const id = String(formData.get("savedId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const remindAtRaw = String(formData.get("remindAt") ?? "").trim();
  const collectionId = String(formData.get("collectionId") ?? "");

  const remindAt = remindAtRaw ? new Date(remindAtRaw) : null;

  await db
    .update(savedArticles)
    .set({
      note: note || null,
      remindAt: remindAt && !Number.isNaN(remindAt.getTime()) ? remindAt : null,
      collectionId: collectionId || null,
    })
    .where(and(eq(savedArticles.id, id), eq(savedArticles.userId, user.id)));

  refresh();
}

export async function setArchived(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const id = String(formData.get("savedId") ?? "");
  const archived = formData.get("archived") === "true";

  await db
    .update(savedArticles)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(savedArticles.id, id), eq(savedArticles.userId, user.id)));

  refresh();
}

export async function removeSaved(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const id = String(formData.get("savedId") ?? "");
  await db
    .delete(savedArticles)
    .where(and(eq(savedArticles.id, id), eq(savedArticles.userId, user.id)));

  refresh();
}
