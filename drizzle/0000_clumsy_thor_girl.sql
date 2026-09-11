CREATE TABLE "article_summaries" (
	"article_id" text PRIMARY KEY NOT NULL,
	"summary_en" text,
	"summary_hi" text,
	"grounded" boolean DEFAULT false NOT NULL,
	"model_used" text,
	"generated_at" timestamp with time zone,
	"translated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"byline" text,
	"published_at" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scope" text NOT NULL,
	"category" text NOT NULL,
	"content_type" text DEFAULT 'news-report' NOT NULL,
	"cluster_id" text NOT NULL,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"rank_score" real DEFAULT 0 NOT NULL,
	"excerpt" text
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"article_id" text NOT NULL,
	"collection_id" text,
	"note" text,
	"remind_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"homepage" text NOT NULL,
	"country" text NOT NULL,
	"kind" text NOT NULL,
	"priority" integer NOT NULL,
	"resolved_feed_url" text,
	"discovery_method" text,
	"last_scanned_at" timestamp with time zone,
	"baseline_done" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"default_sort" text DEFAULT 'newest' NOT NULL,
	"default_range" text DEFAULT '1d' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_summaries" ADD CONSTRAINT "article_summaries_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_cluster_id_story_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."story_clusters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_articles" ADD CONSTRAINT "saved_articles_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_articles" ADD CONSTRAINT "saved_articles_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "articles_canonical_url_idx" ON "articles" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "articles_scope_category_idx" ON "articles" USING btree ("scope","category");--> statement-breakpoint
CREATE INDEX "articles_cluster_idx" ON "articles" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "articles_published_at_idx" ON "articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "collections_user_idx" ON "collections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_user_name_idx" ON "collections" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_articles_user_article_idx" ON "saved_articles" USING btree ("user_id","article_id");--> statement-breakpoint
CREATE INDEX "saved_articles_user_idx" ON "saved_articles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_articles_remind_at_idx" ON "saved_articles" USING btree ("remind_at");