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

// Copy of src/config/sources.ts plus scan state. Upserted during ingestion.
export const sources = pgTable("sources", {
  id: text("id").primaryKey(), // matches SourceConfig.id
  name: text("name").notNull(),
  homepage: text("homepage").notNull(),
  country: text("country").notNull(), // "IN" | "GLOBAL"
  kind: text("kind").notNull(), // "wire" | "newspaper"
  priority: integer("priority").notNull(),
  resolvedFeedUrl: text("resolved_feed_url"), // feed URL found by discovery
  discoveryMethod: text("discovery_method"), // "explicit" | "head-meta" | "common-path" | "sitemap" | null
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
  baselineDone: boolean("baseline_done").notNull().default(false),
});

export const storyClusters = pgTable("story_clusters", {
  id: text("id").primaryKey(), // uuid
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
    publishedAt: timestamp("published_at", { withTimezone: true }), // null = no date given
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    scope: text("scope").notNull(), // Scope id from taxonomy.ts
    category: text("category").notNull(), // Category id from taxonomy.ts
    contentType: text("content_type").notNull().default("news-report"), // "news-report" | "opinion"
    clusterId: text("cluster_id").notNull().references(() => storyClusters.id),
    isBaseline: boolean("is_baseline").notNull().default(false), // from the source's first scan, never shown as new
    rankScore: real("rank_score").notNull().default(0),
    excerpt: text("excerpt"), // snippet from the feed
  },
  (t) => [
    uniqueIndex("articles_canonical_url_idx").on(t.canonicalUrl),
    index("articles_scope_category_idx").on(t.scope, t.category),
    index("articles_cluster_idx").on(t.clusterId),
    index("articles_published_at_idx").on(t.publishedAt),
  ]
);

// Summaries, one per article. Never regenerated.
export const articleSummaries = pgTable("article_summaries", {
  articleId: text("article_id").primaryKey().references(() => articles.id),
  summaryEn: text("summary_en"), // null if we couldn't get the article text
  summaryHi: text("summary_hi"),
  grounded: boolean("grounded").notNull().default(false),
  modelUsed: text("model_used"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  translatedAt: timestamp("translated_at", { withTimezone: true }),
});

// Per-visitor tables. No accounts: visitorId is a random UUID cookie set by
// src/proxy.ts. Every query filters on it so visitors only see their own rows.

// Created the first time a visitor saves preferences.
export const visitorPreferences = pgTable("visitor_preferences", {
  visitorId: text("visitor_id").primaryKey(),
  categories: text("categories").array().notNull().default(sql`'{}'::text[]`), // For You categories
  scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`), // For You scopes, empty = all
  defaultSort: text("default_sort").notNull().default("newest"),
  defaultRange: text("default_range").notNull().default("1d"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Folders for saved articles (optional).
export const collections = pgTable(
  "collections",
  {
    id: text("id").primaryKey(), // uuid
    visitorId: text("visitor_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("collections_visitor_idx").on(t.visitorId),
    uniqueIndex("collections_visitor_name_idx").on(t.visitorId, t.name),
  ]
);

// Saved article, with optional collection, note and "come back on" date
// (which only shows it in the Due list, nothing is sent).
export const savedArticles = pgTable(
  "saved_articles",
  {
    id: text("id").primaryKey(), // uuid
    visitorId: text("visitor_id").notNull(),
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
    uniqueIndex("saved_articles_visitor_article_idx").on(t.visitorId, t.articleId),
    index("saved_articles_visitor_idx").on(t.visitorId),
    index("saved_articles_remind_at_idx").on(t.remindAt),
  ]
);

// Article text from Readability (the same text used for summaries). Whether the
// reader can show all of it depends on fullTextOk in src/config/sources.ts.
export const articleContent = pgTable("article_content", {
  articleId: text("article_id").primaryKey().references(() => articles.id),
  html: text("html"), // sanitized when rendered
  textContent: text("text_content"),
  wordCount: integer("word_count").notNull().default(0),
  extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow(),
});

// Likes and interest per visitor per article. For You only uses interest.
export const articleReactions = pgTable(
  "article_reactions",
  {
    visitorId: text("visitor_id").notNull(),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id),
    liked: boolean("liked").notNull().default(false),
    interest: text("interest"), // "interested" | "not-interested" | null
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.visitorId, t.articleId] }),
    index("article_reactions_visitor_idx").on(t.visitorId),
  ]
);
