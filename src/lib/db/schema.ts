import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  real,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Mirrors src/config/sources.ts; upserted at ingestion time so we have a place to track per-source scan state. */
export const sources = pgTable("sources", {
  id: text("id").primaryKey(), // matches SourceConfig.id
  name: text("name").notNull(),
  homepage: text("homepage").notNull(),
  country: text("country").notNull(), // "IN" | "GLOBAL"
  kind: text("kind").notNull(), // "wire" | "newspaper"
  priority: integer("priority").notNull(),
  resolvedFeedUrl: text("resolved_feed_url"), // what the discovery cascade found, cached
  discoveryMethod: text("discovery_method"), // "explicit" | "head-meta" | "common-path" | "sitemap" | null
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
  baselineDone: boolean("baseline_done").notNull().default(false),
});

export const storyClusters = pgTable("story_clusters", {
  id: text("id").primaryKey(), // uuid, generated when a story is first seen
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const articles = pgTable(
  "articles",
  {
    id: text("id").primaryKey(), // uuid
    sourceId: text("source_id").notNull().references(() => sources.id),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    byline: text("byline"),
    publishedAt: timestamp("published_at", { withTimezone: true }), // null = undated, treated as baseline-only
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    scope: text("scope").notNull(), // Scope id from taxonomy.ts
    category: text("category").notNull(), // Category id from taxonomy.ts
    contentType: text("content_type").notNull().default("news-report"), // "news-report" | "opinion"
    clusterId: text("cluster_id").notNull().references(() => storyClusters.id),
    isBaseline: boolean("is_baseline").notNull().default(false), // true = seen during source's first scan, never shown as breaking
    rankScore: real("rank_score").notNull().default(0),
    excerpt: text("excerpt"), // short snippet from feed/sitemap, shown while summary is pending
  },
  (t) => [
    uniqueIndex("articles_canonical_url_idx").on(t.canonicalUrl),
    index("articles_scope_category_idx").on(t.scope, t.category),
    index("articles_cluster_idx").on(t.clusterId),
    index("articles_published_at_idx").on(t.publishedAt),
  ]
);

/** Grounded summaries, cached by article so we never re-summarize the same canonical URL. */
export const articleSummaries = pgTable("article_summaries", {
  articleId: text("article_id").primaryKey().references(() => articles.id),
  summaryEn: text("summary_en"), // null if grounding failed — UI falls back to headline+link only
  summaryHi: text("summary_hi"),
  grounded: boolean("grounded").notNull().default(false),
  modelUsed: text("model_used"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  translatedAt: timestamp("translated_at", { withTimezone: true }),
});

/**
 * Phase 2 — per-user tables.
 *
 * `userId` is the Supabase `auth.users.id` uuid. There is no foreign key to it:
 * `auth` is Supabase's own schema and drizzle-kit only manages `public`, so a
 * reference here would make `db:push` try to touch a schema it doesn't own.
 * Deleting a user therefore leaves orphan rows — acceptable, and cheap to sweep.
 *
 * Access control is enforced in application code, not RLS. The app connects as
 * the owning role through DATABASE_URL, which bypasses row-level security, so
 * every read and write below filters on the session-verified user id instead.
 */

/** One row per signed-in user, created lazily the first time they save preferences. */
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  categories: text("categories").array().notNull().default(sql`'{}'::text[]`), // Category ids driving the For You feed
  scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`), // Scope ids to draw For You from; empty = all non-personal scopes
  defaultSort: text("default_sort").notNull().default("newest"),
  defaultRange: text("default_range").notNull().default("1d"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** User-created folders for saved articles. A saved article may sit in none of them. */
export const collections = pgTable(
  "collections",
  {
    id: text("id").primaryKey(), // uuid
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("collections_user_idx").on(t.userId),
    uniqueIndex("collections_user_name_idx").on(t.userId, t.name),
  ]
);

/**
 * A saved article, optionally filed in a collection, annotated, and given a
 * due date. `remindAt` is a date the reader chose to come back to it — it
 * surfaces the row in the Due list and nothing else. No email is ever sent.
 */
export const savedArticles = pgTable(
  "saved_articles",
  {
    id: text("id").primaryKey(), // uuid
    userId: text("user_id").notNull(),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id),
    collectionId: text("collection_id").references(() => collections.id, { onDelete: "set null" }),
    note: text("note"),
    remindAt: timestamp("remind_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }), // set = archived, null = active
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("saved_articles_user_article_idx").on(t.userId, t.articleId),
    index("saved_articles_user_idx").on(t.userId),
    index("saved_articles_remind_at_idx").on(t.remindAt),
  ]
);

/**
 * Full article text for the in-app reader, kept out of `articles` for the same
 * reason summaries are: it's large, optional, and fetched on a different
 * schedule. `extract.ts` already runs Readability to ground summaries — this is
 * that same extraction, persisted instead of discarded.
 *
 * Whether any of it is *shown* is a separate decision made per source by
 * `fullTextOk` in src/config/sources.ts. Storing it is not permission to render it.
 */
export const articleContent = pgTable("article_content", {
  articleId: text("article_id").primaryKey().references(() => articles.id),
  html: text("html"), // sanitized at render time, never trusted as stored
  textContent: text("text_content"),
  wordCount: integer("word_count").notNull().default(0),
  extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per reader per article. `liked` and `interest` are independent: a
 * like is approval of this story, interest is a signal about stories like it,
 * and the For You ranking reads only the latter.
 */
export const articleReactions = pgTable(
  "article_reactions",
  {
    userId: text("user_id").notNull(),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id),
    liked: boolean("liked").notNull().default(false),
    interest: text("interest"), // "interested" | "not-interested" | null — mutually exclusive
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.articleId] }),
    index("article_reactions_user_idx").on(t.userId),
  ]
);

/** Public identity. A user without a row here simply has no public page. */
export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id").primaryKey(),
    handle: text("handle").notNull(), // the /u/<handle> segment
    displayName: text("display_name"),
    bio: text("bio"),
    // Validated host-side against instagram.com / x.com before insert. These
    // render as links on a public page, so an unvalidated value is an open redirect.
    instagramUrl: text("instagram_url"),
    xUrl: text("x_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("profiles_handle_idx").on(t.handle)]
);

/** A repost is public by definition — it appears on the reposter's profile. */
export const reposts = pgTable(
  "reposts",
  {
    id: text("id").primaryKey(), // uuid
    userId: text("user_id").notNull(),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reposts_user_article_idx").on(t.userId, t.articleId),
    index("reposts_user_idx").on(t.userId),
  ]
);
