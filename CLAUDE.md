@AGENTS.md

# Bharat Lens — non-negotiable rules

India-first news reader. Next.js 16 (App Router) + TypeScript + Tailwind v4,
Postgres via Drizzle, deployed on Vercel with a cron-driven ingestion pipeline.

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before changing anything
structural.** It covers the ingestion cascade, dedup, ranking, classification, the
visitor model, the reader, the timeline, and the bugs that have already cost time.
This file is only the rules that must not be relaxed.

## Product rules

These are product rules, not preferences. Do not relax them.

1. **The app must run fully with zero AI keys configured.** Deterministic ranking,
   classification, filtering and browsing all work without any provider key. AI is
   strictly additive (summaries, translation, rerank, spike verification) and every
   AI call falls back silently on failure. Never block the feed on an AI call.
2. **Summaries are grounded only.** Fetch the canonical article text first
   (`lib/ingestion/extract.ts`), pass only that text to the model, and let the
   summary restate only what is in it. No speculation, no outside facts, no
   causation the article didn't assert, neutral register. Exactly two sentences.
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
   scopes, categories, keyword lists and URL path hints in `src/config/taxonomy.ts`;
   UI strings in `src/config/ui-strings.ts`. Never hardcode a source or category
   into application logic, and never hardcode display text into a component.

## Privacy and access rules

9. **There are no accounts, and none should be added without being asked for.**
   Personal state is keyed to an anonymous UUID cookie minted by `src/proxy.ts`.
   No email, no password, no personal data. Never introduce a sign-up flow as a
   side effect of another change.
10. **The visitor cookie is client-supplied and must stay validated.** It is the
    primary key every per-visitor row is filed under. Anything that isn't a UUID is
    discarded and replaced (`src/lib/visitor-constants.ts`). Every per-visitor read
    and write filters on it so one reader never touches another's rows.
11. **Storing full article text is not permission to publish it.** `article_content`
    holds the Readability extraction for every article; `fullTextOk` in
    `src/config/sources.ts` decides per source whether the reader may render all of
    it, and ships **false for every source**. Anything else shows a lead-in plus a
    copyright hand-off. Reader pages are `noindex` with `rel=canonical` to the
    publisher. Do not flip a source to `true` without written permission for it.
12. **Publisher HTML is never trusted.** `src/lib/sanitize.ts` is an allowlist —
    unknown tag dropped, unknown attribute dropped, non-http(s) URL dropped. It
    renders through `dangerouslySetInnerHTML` on our own origin.

## Build and tooling constraints

13. **An unreachable database degrades, it does not 500.** Rule 1's contract
    applies to Postgres too: when the Supabase project paused after a week idle,
    every page returned a stack trace. Page-level reads go through `tryDb`
    (`src/lib/db/availability.ts`), which returns null only for *connection*
    failures and rethrows everything else — a bad column or a missing view must
    still fail loudly. Note that drizzle wraps the real error in a
    `DrizzleQueryError` and keeps the cause on `.cause`, so the detector walks
    that chain; checking only the outer error silently matches nothing.
    `null` from `tryDb` means "could not ask" and must never be rendered as
    "nothing found".
14. **Clock reads live in `src/lib/clock.ts`.** `react-hooks/purity` fails the build
    on `Date.now()` inside a component body, Server Components included. Read once
    per request there and pass the value down.
15. **`drizzle-kit push` crashes on this database** (0.31.10 bug introspecting an
    existing CHECK constraint). Use `drizzle-kit generate` and apply the new
    statements with guarded SQL — never let it try to reconcile the whole schema.
16. **The cron is daily, not 3-hourly, because of the Vercel plan.** Hobby caps cron
    at once per day and *fails the deployment* for any more frequent expression, so
    `vercel.json` uses `0 1 * * *`. To ingest more often without paying, keep this
    entry and have an external scheduler hit `/api/cron/ingest` with
    `Authorization: Bearer $CRON_SECRET`. Do not raise the frequency here on Hobby.
17. **Next.js 16 specifics**: `params`, `searchParams` and `cookies()` are async;
    `middleware` is renamed `proxy`; `revalidateTag` needs a second cacheLife
    argument. Read `node_modules/next/dist/docs/` rather than relying on training
    data.
18. **The DB client is lazily constructed** (`lib/db/client.ts`). Next evaluates
    route modules during build-time page-data collection even for `force-dynamic`
    routes, so throwing on a missing `DATABASE_URL` at import time breaks
    `next build`.
19. **Server-only imports leak through client components.** `lib/lang.ts` imports
    `next/headers`; the cookie *name* lives in `lib/lang-constants.ts` so client
    components can import it without pulling in the server module. Same pattern for
    `lib/visitor.ts` and `lib/visitor-constants.ts`.

## Commands

```bash
npm run dev              # dev server
npm run build            # production build
npm run lint             # eslint
npx tsc --noEmit         # typecheck
npm run db:push          # apply schema to Postgres (see rule 15 first)
npm run db:setup         # apply drizzle/manual/*.sql (search index, analytics views)
npm run ingest           # run the ingestion pipeline locally

npm run stats            # corpus stats
npm run reclassify       # re-run classification over stored rows
npm run recluster        # rebuild story clusters over stored rows
npm run decode-entities  # normalize stored titles, excerpts and bylines
npm run resummarize      # re-summarize stored rows
npm test                 # all assertion suites (classifier + db availability)
npm run debug-source <source-id>

pytest analysis                       # analysis unit tests (pip install -r analysis/requirements.txt)
python analysis/report.py --days 30   # coverage findings, charts, CSVs → analysis/output/
```

`/insights` and `analysis/` both read the `analytics.*` views in
`drizzle/manual/0002_analytics_views.sql`. Change cleaning rules there, not in
TypeScript or pandas. `analysis/output/`, the run notebook and
the README screenshots come from the weekly GitHub Action against production;
don't commit versions made from local or fake data.

Ingestion classifies, clusters and summarizes **once**, at insert time. Any change to
taxonomy keywords, classifier logic, clustering rules or the summary prompt therefore
does nothing to rows already stored until the matching backfill script is re-run.

## Source-specific notes

- **Publishers block unknown bots.** Business Standard, ANI and AP return 403 to a
  custom bot UA even for their own advertised feeds, so `lib/ingestion/http.ts`
  sends a browser UA. robots.txt is still honoured.
- **PTI goes quiet for stretches.** Its news sitemap index was stale from 2026-08-26
  and the source returned nothing for weeks; it resumed on its own on 2026-09-13
  without any change here. That is the discovery cascade working as intended — a dead
  source costs one request per run and recovers by itself. Don't remove a source
  because it is returning zero today.
