# Bharat Lens

**India-first news intelligence dashboard.** One place to read India, India abroad,
what's hitting India from outside, and the wider world — from wire services and
newspapers only, deduplicated across outlets, with grounded plain-language summaries.

> Live demo: _pending deploy_ · Dark mode by default, English/हिंदी toggle, mobile-first.

---

## What it does

**Two dimensions that combine freely.** Four scopes — India, India Abroad, Impact on
India, World — each carrying all ten categories (Finance, Politics, Sports,
Technology, Business & Economy, Environment, Education, Entertainment, Health, Gen-Z).
Every combination is valid: Finance-in-World, Sports-in-Impact-on-India, all of it.

**Sources:** 17 wire services and print/digital newspapers — PTI, ANI, Reuters, AP,
AFP, The Hindu, Indian Express, Livemint, Business Standard, Economic Times,
Hindustan Times, Scroll, The Print, BBC, The Guardian, Bloomberg, Al Jazeera.
No television news: print and wire journalism carries bylines, editorial desks, and
published correction policies, and that standard is applied uniformly regardless of
an outlet's political leaning.

---

## The interesting engineering

### Feed discovery is a cascade, because RSS is dying

Roughly a third of these publishers expose no usable RSS at all. The pipeline tries,
in order: an explicit feed URL → feed links declared in the page `<head>` → common
RSS paths (`/feed`, `/rss`, …) → sitemaps discovered via `robots.txt`, including
recursive sitemap indexes. Every step validates it actually received XML before
accepting the result, and a blocked or wrong-content step falls through instead of
failing the source.

This isn't theoretical. Measured against the live web:

| Discovery path | Sources |
| --- | --- |
| Explicit/declared RSS | AFP, The Hindu, Indian Express, Livemint, Business Standard, Economic Times, Hindustan Times, BBC, The Guardian, Bloomberg, Al Jazeera |
| RSS at a non-obvious URL | Scroll (feed lives on Feedburner, not `scroll.in/feed`) |
| Sitemap fallback only | PTI, ANI, Reuters, AP, The Print |

An RSS-only implementation would silently lose five of the seventeen sources —
including Reuters and AP.

### Deterministic first, AI second — and it runs with zero AI keys

Ranking, scope/category classification, dedup, clustering, and every filter are
pure deterministic logic. If an AI provider key is configured, it adds summaries,
Hindi translation, and optional reranking on top; if any AI call fails, it falls
back silently. Nothing in the reading experience blocks on a model call.

Classification is ordered by signal strength: the publisher's own URL section path
(`/world/`, `/sports/`, `/opinion/`) beats headline keyword matching, which beats a
general bucket. Two bugs worth naming, because both are easy to ship by accident:

- Keyword matching must be **word-boundary** based. Plain `includes("ai")` matches
  "said", "again", "chair" — it inflated the Technology category by 14×. Likewise
  `includes("india")` happily matches "Indiana".
- An Indian outlet's `/world/` story is **world news**, not India news. Without a
  foreign-desk check, 230 international stories sat in the India tab.

### Summaries are grounded or absent — never invented

Before any model call, the canonical page is fetched and parsed with Readability.
Only that extracted text is passed to the model, and the summary may only restate
what's in it — no outside facts, no predictions, no causation the article didn't
assert. If the text can't be retrieved or is too thin, the card shows headline and
source link only. A card never gets filled in with a guess.

Summaries are cached by canonical-URL identity and never regenerated; Hindi
translations are cached alongside the English summary and produced lazily on first
request. Translate once, serve many.

### Dedup happens twice, for two different problems

Canonical-URL identity (with tracking parameters stripped) stops the same URL being
ingested twice. Separately, title-token Jaccard similarity within a 48-hour window
groups the *same story across different outlets* into one card that lists every
outlet reporting it — so a story carried by six papers is one card, not six.

### Ranking selects, then orders

Two distinct steps. First the day's queue is *selected* from the broad candidate
pool with a source-diversity cap, so one prolific outlet can't wall off a scope
(before this, `/world` was 29 cards from a single publisher). Then that queue is
*ordered* by whatever sort the reader chose.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), TypeScript, Tailwind v4 |
| Database | Supabase Postgres via Drizzle ORM |
| Ingestion | Vercel Cron → `/api/cron/ingest`, writes to Postgres |
| AI | Provider-swappable behind one interface (Anthropic by default); entirely optional |
| Hosting | Vercel |

Readers always read from the database. Page loads never trigger scraping.

---

## Local setup

```bash
git clone <repo-url> && cd Bharat-lens
npm install
cp .env.local.example .env.local   # add your DATABASE_URL
npm run db:push                    # create tables
npm run ingest                     # first run records a quiet baseline
npm run dev
```

Only `DATABASE_URL` is required. Without `ANTHROPIC_API_KEY` the app runs fully —
you just get headline-and-source cards instead of summaries.

### Useful scripts

```bash
npm run ingest                                             # run the pipeline
npx tsx --env-file=.env.local src/scripts/stats.ts         # corpus stats by scope/category/source
npx tsx --env-file=.env.local src/scripts/reclassify.ts    # re-run classification over stored rows
npx tsx src/scripts/test-classify.ts                       # classifier assertions
npx tsx --env-file=.env.local src/scripts/debug-source.ts reuters ap   # diagnose a source
```

`reclassify` matters: articles are classified once at ingestion, so changing the
taxonomy requires re-running it over stored rows.

---

## Roadmap

- **Phase 1 (done)** — scopes, categories, discovery cascade, deterministic ranking,
  grounded summaries with caching, sort/time filters, EN/HI toggle, Active/History.
- **Phase 2 (done)** — Supabase Auth (email + password), For You feed, saved articles
  with collections, notes and due dates, per-user archive, persisted preferences.
- **Phase 2.5 (done)** — in-app reader with a per-source full-text allowlist, five-way
  engagement (like / interested / not interested / save / repost), public profiles with
  Instagram and X links, month timeline with auto-detected news spikes, Gemini as a
  zero-cost default AI provider, everyday-Hindi copy pass, and a wider two-column layout
  with View Transitions.
- **Phase 3** — AI rerank, 24h recommendation refresh, cross-source comparison view,
  News vs Opinion classification surfaced as a filter, search, OG images per article.

## Known limitations

- **PTI yields nothing right now.** Their news sitemap index has been stale since
  26 Aug 2026 and their main sitemap is a static 2023 site map. It stays configured
  and self-heals when they resume publishing.
- **Most stories land in the general category bucket.** Deterministic classification
  from a headline plus a URL path can only go so far; publishers with generic paths
  (`/article/`, `/news/`) and headlines without category keywords have no signal to
  read. AI-assisted classification of the residual is the intended fix.
- **"Most Popular" is a proxy.** It uses the deterministic score until real
  view-count tracking exists.
