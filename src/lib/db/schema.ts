import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

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
