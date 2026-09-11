import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articles, profiles, reposts, sources } from "@/lib/db/schema";
import type { Category } from "@/config/taxonomy";

export interface Profile {
  userId: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  instagramUrl: string | null;
  xUrl: string | null;
}

export interface RepostItem {
  id: string;
  articleId: string;
  title: string;
  canonicalUrl: string;
  sourceName: string;
  category: Category;
  comment: string | null;
  createdAt: Date;
}

/**
 * Only these hosts are accepted for the two social links. A profile page is
 * public, so an unvalidated URL here is an open redirect pointing at whatever
 * the user typed — the allowlist is the product requirement and the guard.
 */
const SOCIAL_HOSTS: Record<"instagram" | "x", string[]> = {
  instagram: ["instagram.com", "www.instagram.com"],
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
};

export function normalizeSocialUrl(raw: string, network: "instagram" | "x"): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Accept a bare handle too — "@someone" is how people actually write it.
  const handle = trimmed.replace(/^@/, "");
  if (/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
    return network === "instagram"
      ? `https://instagram.com/${handle}`
      : `https://x.com/${handle}`;
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!SOCIAL_HOSTS[network].includes(url.hostname.toLowerCase())) return null;
    return `https://${url.hostname.replace(/^www\./, "")}${url.pathname}`;
  } catch {
    return null;
  }
}

/** Handles are the public URL segment, so they're slugified and collision-checked. */
export function slugifyHandle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export async function getProfileByUserId(userId: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return row ?? null;
}

export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.handle, handle)).limit(1);
  return row ?? null;
}

/**
 * Ensures the user has a public identity, deriving a handle from their email.
 * Called the first time they repost — a repost with nowhere to live is useless.
 */
export async function ensureProfile(userId: string, email: string | null): Promise<Profile> {
  const existing = await getProfileByUserId(userId);
  if (existing) return existing;

  const base = slugifyHandle(email?.split("@")[0] ?? "") || "reader";
  let handle = base;
  for (let attempt = 1; await getProfileByHandle(handle); attempt++) {
    handle = `${base}-${attempt}`;
  }

  const [row] = await db.insert(profiles).values({ userId, handle }).returning();
  return row;
}

export async function listReposts(userId: string): Promise<RepostItem[]> {
  const rows = await db
    .select({
      id: reposts.id,
      articleId: reposts.articleId,
      title: articles.title,
      canonicalUrl: articles.canonicalUrl,
      sourceName: sources.name,
      category: articles.category,
      comment: reposts.comment,
      createdAt: reposts.createdAt,
    })
    .from(reposts)
    .innerJoin(articles, eq(reposts.articleId, articles.id))
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(eq(reposts.userId, userId))
    .orderBy(desc(reposts.createdAt));

  return rows.map((r) => ({ ...r, category: r.category as Category }));
}

export async function getRepostedArticleIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ articleId: reposts.articleId })
    .from(reposts)
    .where(eq(reposts.userId, userId));
  return new Set(rows.map((r) => r.articleId));
}
