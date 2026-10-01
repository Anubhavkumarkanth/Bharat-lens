-- Views for /insights and analysis/.
--
--   analytics.article_base   one row per article, with a label for how usable its publish time is
--   analytics.cluster_facts  one row per story
--   analytics.article_facts  article_base plus its story's columns
--
-- Separate schema so drizzle-kit leaves them alone. Safe to re-run:
--
--   psql "$DATABASE_URL" -f drizzle/manual/0002_analytics_views.sql
--
-- (or: python analysis/report.py --install-views)

CREATE SCHEMA IF NOT EXISTS analytics;

DROP VIEW IF EXISTS analytics.article_facts;
DROP VIEW IF EXISTS analytics.cluster_facts;
DROP VIEW IF EXISTS analytics.article_base;

-- time_quality: publish times come from the publisher, so check them.
--   missing    no time in the feed
--   date-only  exactly midnight UTC or IST, i.e. a date with no time
--   future     after we first saw the article (usually a timezone bug)
--   stale      more than 7 days before we saw it (republished page)
-- Only 'ok' rows get a reported_at. discovered_at isn't used for timing because
-- the cron runs daily.
CREATE VIEW analytics.article_base AS
SELECT
  b.*,
  CASE WHEN b.time_quality = 'ok' THEN b.published_at END AS reported_at
FROM (
  SELECT
    a.id AS article_id,
    a.title,
    a.source_id,
    s.name AS source_name,
    s.kind AS source_kind,
    s.country AS source_country,
    a.scope,
    a.category,
    a.content_type,
    a.cluster_id,
    a.is_baseline,
    a.published_at,
    a.discovered_at,
    CASE
      WHEN a.published_at IS NULL THEN 'missing'
      WHEN (a.published_at AT TIME ZONE 'UTC')::time IN ('00:00:00', '18:30:00') THEN 'date-only'
      WHEN a.published_at > a.discovered_at + interval '1 hour' THEN 'future'
      WHEN a.published_at < a.discovered_at - interval '7 days' THEN 'stale'
      ELSE 'ok'
    END AS time_quality,
    sm.grounded, -- null if never summarized (e.g. no AI key)
    c.word_count
  FROM articles a
  JOIN sources s ON s.id = a.source_id
  LEFT JOIN article_summaries sm ON sm.article_id = a.id
  LEFT JOIN article_content c ON c.article_id = a.id
) b;

-- A story = a cluster of similar headlines from different outlets (48h window).
CREATE VIEW analytics.cluster_facts AS
SELECT
  cluster_id,
  COUNT(*)::int AS articles,
  COUNT(DISTINCT source_id)::int AS sources,
  COUNT(DISTINCT source_id) FILTER (WHERE reported_at IS NOT NULL)::int AS timed_sources,
  BOOL_OR(source_kind = 'wire') AS has_wire,
  BOOL_OR(source_kind = 'newspaper' AND source_country = 'IN') AS has_indian_paper,
  MIN(reported_at) AS first_reported_at,
  MAX(reported_at) AS last_reported_at,
  MIN(reported_at) FILTER (WHERE source_kind = 'wire') AS first_wire_reported_at,
  MIN(discovered_at) AS first_discovered_at,
  MODE() WITHIN GROUP (ORDER BY scope) AS scope,
  MODE() WITHIN GROUP (ORDER BY category) AS category,
  (ARRAY_AGG(title ORDER BY reported_at NULLS LAST, discovered_at))[1] AS headline
FROM analytics.article_base
GROUP BY cluster_id;

-- reported_first / lag_minutes are only meaningful when cluster_timed_sources >= 2.
CREATE VIEW analytics.article_facts AS
SELECT
  b.*,
  cf.sources AS cluster_sources,
  cf.timed_sources AS cluster_timed_sources,
  cf.has_wire AS cluster_has_wire,
  cf.first_reported_at AS cluster_first_reported_at,
  cf.first_wire_reported_at AS cluster_first_wire_reported_at,
  (b.reported_at = cf.first_reported_at) AS reported_first,
  EXTRACT(EPOCH FROM (b.reported_at - cf.first_reported_at)) / 60.0 AS lag_minutes
FROM analytics.article_base b
JOIN analytics.cluster_facts cf ON cf.cluster_id = b.cluster_id;
