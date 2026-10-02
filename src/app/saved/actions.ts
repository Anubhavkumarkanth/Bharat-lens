"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { collections, savedArticles } from "@/lib/db/schema";
import { getVisitorId } from "@/lib/visitor";

// Every query here also filters on the visitor id, so nobody can edit someone
// else's rows by guessing an id.

export interface SavedFormState {
  error?: string;
}

function refresh() {
  revalidatePath("/saved");
  revalidatePath("/[scope]", "page");
}

// Save, or unsave if already saved.
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

  // duplicate name is ignored
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
  // saved articles stay (collection_id is set to null)
  await db.delete(collections).where(and(eq(collections.id, id), eq(collections.visitorId, visitorId)));

  refresh();
}

// Updates note, date and collection together.
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
