"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { collections, savedArticles } from "@/lib/db/schema";
import { getVisitorId } from "@/lib/visitor";

/**
 * Every mutation below scopes its WHERE clause to the anonymous visitor cookie.
 * There is nothing to authenticate, but a row id arriving from a form is still
 * never trusted on its own — pairing it with the visitor id is what stops one
 * reader editing another's saved article by guessing a uuid.
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
  const visitorId = await getVisitorId();
  if (!visitorId) return;

  const [existing] = await db
    .select({ id: savedArticles.id })
    .from(savedArticles)
    .where(and(eq(savedArticles.visitorId, visitorId), eq(savedArticles.articleId, articleId)))
    .limit(1);

  if (existing) {
    await db.delete(savedArticles).where(eq(savedArticles.id, existing.id));
  } else {
    await db.insert(savedArticles).values({
      id: crypto.randomUUID(),
      visitorId,
      articleId,
    });
  }

  refresh();
}

export async function createCollection(
  _prev: SavedFormState,
  formData: FormData
): Promise<SavedFormState> {
  const visitorId = await getVisitorId();
  if (!visitorId) return {};

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return {};

  // A duplicate name is the reader re-creating a folder they already have;
  // the unique index makes that a no-op rather than an error page.
  await db
    .insert(collections)
    .values({ id: crypto.randomUUID(), visitorId, name })
    .onConflictDoNothing();

  refresh();
  return {};
}

export async function deleteCollection(formData: FormData): Promise<void> {
  const visitorId = await getVisitorId();
  if (!visitorId) return;

  const id = String(formData.get("collectionId") ?? "");
  // Saved rows survive: collection_id is ON DELETE SET NULL, so the articles
  // fall back to "no collection" rather than disappearing with the folder.
  await db.delete(collections).where(and(eq(collections.id, id), eq(collections.visitorId, visitorId)));

  refresh();
}

/** Note, due date and collection are edited together from one row-level form. */
export async function updateSavedItem(formData: FormData): Promise<void> {
  const visitorId = await getVisitorId();
  if (!visitorId) return;

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
    .where(and(eq(savedArticles.id, id), eq(savedArticles.visitorId, visitorId)));

  refresh();
}

export async function setArchived(formData: FormData): Promise<void> {
  const visitorId = await getVisitorId();
  if (!visitorId) return;

  const id = String(formData.get("savedId") ?? "");
  const archived = formData.get("archived") === "true";

  await db
    .update(savedArticles)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(savedArticles.id, id), eq(savedArticles.visitorId, visitorId)));

  refresh();
}

export async function removeSaved(formData: FormData): Promise<void> {
  const visitorId = await getVisitorId();
  if (!visitorId) return;

  const id = String(formData.get("savedId") ?? "");
  await db
    .delete(savedArticles)
    .where(and(eq(savedArticles.id, id), eq(savedArticles.visitorId, visitorId)));

  refresh();
}
