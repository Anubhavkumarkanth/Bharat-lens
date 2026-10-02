-- Full-text search index for /search. Drizzle can't define this one, so apply
-- it by hand after db:push:
--
--   psql "$DATABASE_URL" -f drizzle/manual/0001_search_index.sql
--
-- The expression has to match searchArticles() exactly or it won't be used.
-- 'english' has to be given explicitly for the index to be allowed.

CREATE INDEX IF NOT EXISTS "articles_search_idx"
ON "articles" USING GIN (
  to_tsvector('english', "title" || ' ' || coalesce("excerpt", ''))
);
