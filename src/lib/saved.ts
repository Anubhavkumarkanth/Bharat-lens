import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articles, collections, savedArticles, sources } from "@/lib/db/schema";
import type { Category } from "@/config/taxonomy";

export type SavedView = "active" | "due" | "archived";

export interface Collection {
  id: string;
  name: string;
}

export interface SavedItem {
  id: string; // saved_articles.id, the handle every mutation takes
  articleId: string;
  title: string;
  canonicalUrl: string;
  sourceName: string;
  publishedAt: Date | null;
  category: Category;
  note: string | null;
  remindAt: Date | null;
  overdue: boolean; // remindAt is in the past; decided here so cards stay pure
  archivedAt: Date | null;
  collectionId: string | null;
  savedAt: Date;
}

/**
 * Which of the currently displayed articles this reader has already saved, so
 * the card can render Save vs Saved without a query per card.
 */
export async function getSavedArticleIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ articleId: savedArticles.articleId })
    .from(savedArticles)
    .where(eq(savedArticles.userId, userId));
  return new Set(rows.map((r) => r.articleId));
}

export async function listCollections(userId: string): Promise<Collection[]> {
  return db
    .select({ id: collections.id, name: collections.name })
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(asc(collections.name));
}

export async function listSaved(
  userId: string,
  opts: { view: SavedView; collectionId?: string }
): Promise<SavedItem[]> {
  const conditions = [eq(savedArticles.userId, userId)];

  if (opts.view === "archived") conditions.push(isNotNull(savedArticles.archivedAt));
  else conditions.push(isNull(savedArticles.archivedAt));

  if (opts.view === "due") conditions.push(isNotNull(savedArticles.remindAt));
  if (opts.collectionId) conditions.push(eq(savedArticles.collectionId, opts.collectionId));

  const rows = await db
    .select({
      id: savedArticles.id,
      articleId: savedArticles.articleId,
      title: articles.title,
      canonicalUrl: articles.canonicalUrl,
      sourceName: sources.name,
      publishedAt: articles.publishedAt,
      category: articles.category,
      note: savedArticles.note,
      remindAt: savedArticles.remindAt,
      archivedAt: savedArticles.archivedAt,
      collectionId: savedArticles.collectionId,
      savedAt: savedArticles.savedAt,
    })
    .from(savedArticles)
    .innerJoin(articles, eq(savedArticles.articleId, articles.id))
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(and(...conditions))
    // Due items read as a to-do list, so the soonest date comes first; every
    // other view is a reading pile, newest on top.
    .orderBy(opts.view === "due" ? asc(savedArticles.remindAt) : desc(savedArticles.savedAt));

  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    category: r.category as Category,
    overdue: r.remindAt !== null && r.remindAt.getTime() < now,
  }));
}
