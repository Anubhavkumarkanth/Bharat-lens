# Architecture

Notes on how Bharat Lens is put together and why. The README covers what it does;
this covers the decisions I'd have to defend in a code review.

## The shape of the data

Two dimensions that combine freely:

- **Scope** — India, India Abroad, Impact on India, World, and For You
- **Category** — Finance, Politics, Sports, Technology, Business & Economy,
  Environment, Education, Entertainment, Health, Gen-Z

Every combination is valid. Finance-in-World and Sports-in-Impact-on-India are both
real views. Neither dimension is hardcoded against the other, and neither lives in
application logic — both are lists in `src/config/taxonomy.ts`, so adding a category
is a config edit rather than a code change.

## Ingestion

Runs on a schedule and writes to Postgres. Readers only ever read from the database —
a page load never triggers a fetch to a publisher.

### Feed discovery is a cascade, because RSS is dying

About a third of these publishers expose no usable RSS. The pipeline tries, in order:

1. An explicit feed URL from config
2. Feed links declared in the page `<head>`
3. Common RSS paths (`/feed`, `/rss`, and so on)
4. Sitemaps found via `robots.txt`, including recursive sitemap indexes

Each step checks that it actually received XML before accepting the result, so a
blocked or wrong-content step falls through instead of failing the whole source.

This was not a hypothetical worry. Measured against the live web:

| Discovery path | Sources |
| --- | --- |
| Explicit or declared RSS | AFP, The Hindu, Indian Express, Livemint, Business Standard, Economic Times, Hindustan Times, BBC, The Guardian, Bloomberg, Al Jazeera |
| RSS at a non-obvious URL | Scroll — its feed lives on Feedburner, not on scroll.in |
| Sitemap fallback only | PTI, ANI, Reuters, AP, The Print |

An RSS-only implementation loses five of seventeen sources, including Reuters and AP.

Sitemap resolution is bounded on three axes — depth (2), URL count (500) and age
(7 days) — because a sitemap index can fan out a long way, and I would rather cap it
than find the limit in production.

### Publishers block unknown bots

Business Standard, ANI and AP return 403 to a custom bot user-agent, even for feeds
they advertise publicly. `src/lib/ingestion/http.ts` sends a browser user-agent.
`robots.txt` is still honoured — the point is to look like a normal client, not to
ignore what a site has asked crawlers to leave alone.

### Dedup happens twice, for two different problems

**The same URL twice.** Canonical-URL identity with tracking parameters stripped,
backed by a unique index. Cheap and exact.

**The same story from different outlets.** Title-token Jaccard similarity within a
48-hour window groups them into one story cluster. A story carried by six papers
becomes one card listing all six, instead of six cards saying the same thing.

## Classification

Deterministic, and ordered by signal strength: the publisher's own URL section path
(`/world/`, `/sports/`, `/opinion/`) beats headline keyword matching, which beats a
general bucket. A publisher telling you the section is better evidence than a keyword
you guessed at.

Two bugs worth naming, because both are easy to ship by accident:

- **Keyword matching has to be word-boundary based.** A plain substring check for
  "ai" matches "said", "again" and "chair" — it inflated Technology by roughly 14x.
  A substring check for "india" cheerfully matches "Indiana".
- **An Indian outlet's `/world/` story is world news, not India news.** Without a
  foreign-desk check, 230 international stories sat in the India tab.

Classification happens once, at insert time. Changing the taxonomy therefore means
re-running it over stored rows, which is what `src/scripts/reclassify.ts` is for.

## Ranking selects, then orders

Two distinct steps, in this order:

1. **Select** the day's queue from the broad candidate pool, applying a
   source-diversity cap. Before this existed, `/world` was 29 cards from one
   publisher.
2. **Order** that queue by whatever sort the reader asked for.

Collapsing these into a single sort is the obvious thing to do, and it is wrong: a
prolific outlet wins on recency and walls off the scope before the reader's
preference is ever consulted.

## The AI layer is optional by design

Ranking, classification, dedup, clustering and every filter are deterministic. With a
provider key configured, the AI layer adds summaries, Hindi translation, reranking and
news-spike verification on top. Without one, those features are absent and everything
else works.

This is not only about cost. It means the reading experience never blocks on a model
call, an outage degrades features instead of taking the site down, and anyone who
clones the repo can run it without being asked to buy an API key.

Providers sit behind one interface in `src/lib/ai/provider.ts`, with Gemini and
Anthropic implementations selected by environment variable.

### Summaries are grounded or absent

Before any model call, the canonical page is fetched and parsed with Readability. Only
that extracted text goes to the model, and the summary may restate only what is in it
— no outside facts, no predictions, no causation the article did not assert. If the
text cannot be retrieved, or is thinner than 200 characters, the card shows the
headline and a source link and nothing else.

A card is never filled in with a guess. That was the first rule I wrote down, because
a news app that invents detail is worse than one that admits it does not know.

Summaries are cached by canonical-URL identity and never regenerated. Hindi
translations are cached alongside the English summary and produced lazily on first
request — translate once, serve many. This is the single biggest cost control in the
app.

## Readers, without accounts

There is no sign-up. On the first request, `src/proxy.ts` mints a random UUID into an
httpOnly cookie, and that id is what likes, saves, collections, notes, dates and
preferences are filed under.

Two things make this work:

- **Server Components can read cookies but cannot set them.** So the cookie is minted
  in the proxy, before any route renders. It is set on the *request* as well as the
  response, which is what makes it readable by the page rendering on that same
  request — otherwise a first-time reader's very first like would land nowhere.
- **The cookie is client-supplied, so it is not trusted.** It is validated as a UUID
  and replaced otherwise. It is the primary key every per-visitor row is filed under,
  and an arbitrary string would let a visitor write unbounded garbage into it.

The tradeoff is deliberate and worth stating plainly: this is per-browser. Saves do
not follow a reader to their phone, and clearing cookies starts them over. In exchange
there is no sign-up, no password, no email, and no personal data stored anywhere.

For You is assembled from the other scopes using the reader's chosen categories, then
reordered so anything from a category or outlet they marked "interested" floats up.
Stories marked "not interested" are excluded before selection, so a rejected story
does not occupy one of the day's slots. All of it is deterministic and works with no
AI key.

## The in-app reader, and the copyright line

`article_content` stores the Readability extraction for every article — the same
extraction that grounds the summaries, persisted instead of discarded.

Storing it is not permission to publish it. `fullTextOk` in `src/config/sources.ts`
decides per source whether the reader may render the full text, and it ships **false
for every source**. None of these publishers grants republication rights, and wire
services enforce it hardest. Everything else shows a lead-in of roughly the first
third, then hands the reader to the publisher. Reader pages carry `noindex` and a
canonical link to the original.

Publisher HTML is never trusted. `src/lib/sanitize.ts` is an allowlist — unknown tag
dropped, unknown attribute dropped, non-http(s) URL dropped — because that markup
renders through `dangerouslySetInnerHTML` on our own origin.

## The month timeline

A strip of the current month where bar height is that day's volume, and an accent cap
marks a day the detector judged a real event.

The anti-noise rule needs no AI: **a day only counts when at least three distinct
outlets covered the same story.** Bot farms, scraper loops and one publisher going
heavy on listicles all produce volume from one or two origins; a real event gets
picked up across the wire. Volume alone would mark every slow news day.

The baseline is a median, not a mean — one enormous day would drag a mean upward and
hide every other spike behind it. With an AI key configured, an optional pass narrows
the surviving candidates further; without one, the deterministic result stands.

## Things that bit me

- **The `react-hooks/purity` lint rule fails the build on a clock read inside a
  component body**, Server Components included. Clock reads live in
  `src/lib/clock.ts` and happen once per request, then get passed down — which also
  means every card on a page agrees on what "now" is.
- **Drizzle's raw-SQL path hands parameters straight to postgres-js**, which only
  serializes strings and buffers, so passing a `Date` throws. A JS array also becomes
  separate placeholders, which makes `= ANY(...)` fail with "requires array on right
  side".
- **A local-time month boundary is 5.5 hours early in IST** and silently drops the
  last evening of the month. Everything date-bounded is computed in UTC.
- **Publishers double-encode HTML entities in RSS titles.** An escaped entity in the
  XML means the parser's own entity pass unwraps only the outer layer and leaves a
  literal one behind, which React then escapes and renders verbatim. 223 of 3,827
  stored titles were affected.
- **`drizzle-kit push` crashes introspecting this database** (0.31.10, on a CHECK
  constraint it cannot parse). Migrations are generated and applied as guarded SQL
  instead.

## Folder layout

```
src/
  app/         routes, one folder per URL, with server actions beside the page using them
  components/  UI. Client components only where interaction requires it
  config/      the editable parts: sources, taxonomy, UI strings
  lib/         the logic: ingestion, ranking, classification, AI, data access
  scripts/     one-off and maintenance tools, run with tsx
docs/          this file and screenshots
drizzle/       generated migrations and the schema snapshot
```

The rule for `config/` is that behaviour should be editable without touching logic.
Sources live in `sources.ts`, scopes and categories and keyword lists in
`taxonomy.ts`, and every display string in `ui-strings.ts`. No source name or category
id is hardcoded into application code, and no English text is hardcoded into a
component.
