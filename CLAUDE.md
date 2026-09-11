@AGENTS.md

# Bharat Lens — architecture & non-negotiable rules

India-first news intelligence dashboard. Next.js 16 (App Router) + TypeScript +
Tailwind v4, Supabase Postgres via Drizzle, deployed on Vercel with a cron-driven
ingestion pipeline.

## Non-negotiable rules

These are product rules, not preferences. Do not relax them.

1. **The app must run fully with zero AI keys configured.** Deterministic ranking,
   classification, filtering, and browsing all work without any provider key. AI is
   strictly additive (summaries, translation, rerank) and every AI call falls back
   silently on failure. Never block the feed on an AI call.
2. **Summaries are grounded only.** Fetch the canonical article text first
   (`lib/ingestion/extract.ts`), pass only that text to the model, and let the
   summary restate only what is in it. No speculation, no outside facts, no
   causation the article didn't assert, neutral register.
3. **Fail loudly, never fabricate.** If article text can't be retrieved or is too
   thin (<200 chars), store `grounded: false` and show headline + source link only.
   Never summarize from a headline alone. Never invent a title for a sitemap entry.
4. **Cache summaries by article (canonical URL identity).** Never re-summarize the
   same article — this is the single biggest cost control in the app. Hindi
   translations are cached alongside the English summary: translate once, serve many.
5. **First scan records a quiet baseline.** Articles ingested during a source's
   first successful scan are flagged `isBaseline` and never shown as breaking/new.
   Undated entries establish a baseline, not fresh news.
6. **Users read from the database. Never scrape on page load.** All fetching happens
   in the ingestion cron (`/api/cron/ingest`).
7. **Print and wire sources only — no television news.** Editorial-format standard
   applied uniformly regardless of an outlet's political leaning.
8. **Config drives behavior, not code.** Sources live in `src/config/sources.ts`;
   scopes, categories, keyword lists, and URL path hints in `src/config/taxonomy.ts`;
   UI strings in `src/config/ui-strings.ts`. Never hardcode a source or category
   into application logic.

## Accounts, engagement and the reader (Phase 2 / 2.5)

9. **Auth is additive, exactly like AI.** With `NEXT_PUBLIC_SUPABASE_*` unset the app
   still builds and serves every public scope signed-out, and the account controls
   render nothing rather than dead links. Never put a Supabase call on the reading path
   without an `isAuthConfigured()` check.
10. **Authorization is app-level, not RLS.** The app connects through `DATABASE_URL` as
    the owning role, which bypasses row-level security — enabling RLS would be theatre.
    Every read and write of a per-user table filters on the session-verified user id.
    `getUser()` (validates against Supabase), never `getSession()` (trusts the cookie).
11. **Storing full article text is not permission to publish it.** `article_content`
    holds the Readability extraction for every article; `fullTextOk` in
    `src/config/sources.ts` decides per source whether the reader may render all of it,
    and ships **false for every source**. Anything else shows a lead-in plus a
    copyright hand-off. Reader pages are `noindex` with `rel=canonical` to the publisher.
12. **Publisher HTML is never trusted.** `src/lib/sanitize.ts` is an allowlist — unknown
    tag dropped, unknown attribute dropped, non-http(s) URL dropped. It renders through
    `dangerouslySetInnerHTML` on our origin with the reader's session in cookies.
13. **No foreign key to `auth.users`.** That's Supabase's schema and drizzle-kit only
    manages `public`, so a reference would make migrations touch a schema they don't own.
14. **`drizzle-kit push` crashes on this database** (0.31.10 bug introspecting an
    existing CHECK constraint). Use `drizzle-kit generate` and apply the new statements
    with guarded SQL — never let it try to reconcile the whole schema.
15. **Clock reads live in `src/lib/clock.ts`.** `react-hooks/purity` fails the build on
    `Date.now()` inside a component body, Server Components included. Read once per
    request there and pass the value down.

## Architecture

**Two orthogonal dimensions.** SCOPE (India / India Abroad / Impact on India /
World / For You) and CATEGORY (10 of them) combine freely — every combination is
valid. Neither is hardcoded to the other.

**Ingestion** (`src/lib/ingestion/`), run by Vercel Cron every 3h:
- `discovery.ts` — feed discovery cascade: explicit `feedUrl` → `<head>` metadata →
  common RSS paths → sitemap via `robots.txt`. Each step validates it actually got
  XML before accepting; a blocked or wrong-content step falls through to the next.
  This matters: 5 of 17 sources (PTI, ANI, Reuters, AP, The Print) publish no usable
  RSS and only work through sitemap discovery.
- `sitemap-parser.ts` — recursive sitemap-index resolution, bounded by depth (2),
  count (500), and age (7 days).
- `run.ts` — orchestrates discovery → canonicalize → classify → cluster → insert →
  summarize, with per-run caps on title fetches and summarization.

**Classification** (`src/lib/scope-category/classify.ts`) is deterministic and
ordered by signal strength: the publisher's own URL section path first (`/world/`,
`/sports/`, `/opinion/`), then headline keyword matching, then a general bucket.
Keyword matching is word-boundary based — plain `includes()` makes "ai" match
"said"/"again" and "india" match "Indiana".

**Ranking** (`src/lib/ranking/`) is two distinct steps, in this order:
1. *Select* the day's queue from the broad candidate pool with a source-diversity
   cap, so one prolific outlet can't wall off a scope.
2. *Order* that queue by the reader's chosen sort.
Optional AI rerank operates only on the already-bounded candidate set.

**Dedup** is two-layer: exact canonical-URL identity (unique index, tracking params
stripped) prevents re-ingesting the same URL; title-token Jaccard similarity within
48h groups the same story across outlets into one `storyCluster`, surfaced as one
card listing every reporting outlet.

## Commands

```bash
npm run dev              # dev server
npm run build            # production build
npm run lint             # eslint
npx tsc --noEmit         # typecheck
npm run db:push          # apply schema to Postgres
npm run ingest           # run the ingestion pipeline locally
npx tsx --env-file=.env.local src/scripts/stats.ts        # corpus stats
npx tsx --env-file=.env.local src/scripts/reclassify.ts   # re-run classification over stored rows
npx tsx --env-file=.env.local src/scripts/decode-entities.ts # decode HTML entities in stored titles
npx tsx --env-file=.env.local src/scripts/resummarize.ts  # re-summarize stored rows after a prompt change
npx tsx src/scripts/test-classify.ts                       # classifier assertions
npx tsx --env-file=.env.local src/scripts/debug-source.ts <source-id>  # diagnose one source
```

`reclassify.ts` matters: ingestion classifies once at insert time, so any change to
taxonomy keywords or classifier logic requires re-running it over stored rows.

## Gotchas

- **Next.js 16**: `params`, `searchParams`, `cookies()` are all async. `middleware`
  is renamed `proxy`. `revalidateTag` needs a second cacheLife argument. Read
  `node_modules/next/dist/docs/` rather than relying on training data.
- **DB client is lazily constructed** (`lib/db/client.ts`). Next evaluates route
  modules during build-time page-data collection even for `force-dynamic` routes, so
  throwing on a missing `DATABASE_URL` at import time breaks `next build`.
- **Server-only imports leak through client components.** `lib/lang.ts` imports
  `next/headers`; the cookie *name* lives in `lib/lang-constants.ts` so client
  components can import it without pulling in the server module.
- **Publishers block unknown bots.** Business Standard, ANI, and AP return 403 to a
  custom bot UA even for their own advertised feeds, so `lib/ingestion/http.ts`
  sends a browser UA. robots.txt is still honoured.
- **PTI currently yields nothing** — their news sitemap index has been stale since
  2026-08-26 and their main sitemap is a static 2023 site map. Kept configured
  deliberately; it self-heals if they resume publishing.
