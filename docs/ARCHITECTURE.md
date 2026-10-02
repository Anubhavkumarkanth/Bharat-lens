# Architecture

How Bharat Lens works and why some things are the way they are. The README covers what
the app does.

## Scopes and categories

Two filters that can be combined however you like:

- Scope: India, India Abroad, Impact on India, World, For You
- Category: Finance, Politics, Sports, Technology, Business & Economy, Environment,
  Education, Entertainment, Health, Gen-Z (plus General as a fallback)

Any combination works, e.g. Finance in World or Sports in Impact on India. Both lists
live in `src/config/taxonomy.ts`, so adding a category is a config change.

## Ingestion

A scheduled job fetches everything and writes it to Postgres. Pages only read from the
database, so loading a page never hits a publisher's site.

### Finding feeds

About a third of the publishers don't have usable RSS. For each source the pipeline
tries, in order:

1. a feed URL set in the config
2. feed links in the page `<head>`
3. common RSS paths (`/feed`, `/rss`, etc.)
4. sitemaps listed in `robots.txt`, following sitemap indexes

Each step checks that it actually got XML back. If a step is blocked or returns HTML,
it moves on to the next one instead of failing the source.

What I found when I tested this against the live sites:

| How the feed was found | Sources |
| --- | --- |
| Config or `<head>` RSS | AFP, The Hindu, Indian Express, Livemint, Business Standard, Economic Times, Hindustan Times, BBC, The Guardian, Bloomberg, Al Jazeera |
| RSS somewhere unusual | Scroll (its feed is on Feedburner) |
| Sitemap only | PTI, ANI, Reuters, AP, The Print |

With RSS only I'd have lost 5 of the first 17 sources, including Reuters and AP.

Sources also go quiet and come back. PTI's sitemap index stopped updating in late
August and returned nothing for weeks, then started working again in mid-September
without me changing anything. A dead source only costs one request per run, so I leave
them configured.

Sitemap crawling is capped at depth 2, 500 URLs and 7 days old, because sitemap indexes
can get huge.

### User agent

Business Standard, ANI and AP return 403 to a custom bot user agent, even for feeds they
publish. `src/lib/ingestion/http.ts` sends a normal browser user agent. It still checks
`robots.txt`.

### Deduplication

There are two separate problems here.

Same URL twice: URLs are canonicalized (tracking params removed) and there's a unique
index on them. Simple.

Same story from different outlets: titles are compared with token Jaccard similarity
within a 48 hour window, and matches go into one story cluster. Six papers carrying the
same story become one card listing all six.

Each outlet can only appear once per cluster. Without that rule, AP's regional
"Sportswatch Daily Listings" posts had enough words in common that fifteen unrelated
articles got merged into one card, which hid fourteen of them and showed "Also reported
by AP, AP, AP". Same-URL duplicates are already handled by the unique index, so
clustering only needs to group across outlets.

### Time limit and source order

Every summarized article also gets its full text fetched and stored, so going through
all the sources takes much longer than the 300 seconds Vercel allows. If a run goes
over, Vercel just kills it.

So the run stops starting new work after a deadline, and sources are processed
least-recently-scanned first. With a fixed order the same sources at the end of the
list would never get reached. This way, whatever got cut off goes first next time.
Skipped sources are listed in the response so a run that keeps timing out is visible.

## Classification

Classification is rule-based. The strongest signal wins: the URL section
(`/world/`, `/sports/`, `/opinion/`) beats keywords in the headline, which beats the
General fallback. If a publisher put it under `/sports/`, that's better evidence than a
keyword match.

Scope is decided by what the story is about, not who published it. Indian outlets
mention India in almost every story, so India keywords don't tell you much for them.
I used to just send everything from Indian outlets to "india", and India Abroad and
Impact on India ended up with 79 and 37 articles vs 3,909 in India, since only foreign
outlets could fill them. Diaspora keywords ("Indian students", "NRI", "Indian-origin")
are specific enough to work for any publisher, so now every source goes through the same
rules. If a story matches both diaspora and impact keywords, diaspora wins: "Indian
students hit by new visa rules abroad" is about the students.

General is a real category. Unmatched stories used to fall through to Business &
Economy, which put about two thirds of everything (crime, weather, road accidents) in
there and made that filter useless.

Two bugs worth knowing about:

- Keyword matching has to use word boundaries. A substring check for "ai" matches
  "said", "again" and "chair", and made Technology about 14x too big. "india" also
  matches "Indiana".
- A `/world/` story from an Indian outlet is world news. Without checking for that,
  230 international stories were showing up under India.

Classification runs once, at insert time. After changing the taxonomy, run
`src/scripts/reclassify.ts` to update existing rows.

## Ranking

Ranking happens in two steps:

1. Select the day's stories from all candidates, with a cap per source. Before the cap,
   `/world` was 29 cards from one publisher.
2. Sort that selection by whatever the reader picked.

Doing it in one sort doesn't work, because an outlet that publishes a lot wins on
recency and fills the page before the reader's sort is even applied.

Paging interacts with the cap. `selectDailyQueue` sets the per-source cap from the
target size, so selecting one page at a time capped a source at 10 on page 1 and 20 on
page 2. Those were two different selections, and seven stories showed up on both pages.
Now the whole candidate set is ordered once with a cap based on `PAGE_SIZE`, and each
page is a slice of that.

## AI is optional

Ranking, classification, dedup, clustering and filtering are all regular code. With an
AI key set, you also get summaries, Hindi translation, reranking and a check on news
spikes. Without a key those just don't appear and everything else works.

That way the site never waits on a model, an API outage only removes features, and
anyone can run it without paying for an API key.

Providers are behind one interface in `src/lib/ai/provider.ts` (Gemini or Anthropic,
picked by environment variable).

### Summaries

Before summarizing, the article page is fetched and run through Readability. Only that
text goes to the model, and the summary can only restate what's in it: no outside
facts, no predictions, no cause and effect the article didn't state. If the text can't
be fetched, or is under 200 characters, the card shows the headline and a link and
nothing else. A news app that makes things up is worse than one that shows less.

Summaries are cached by canonical URL and never regenerated. Hindi translations are
cached next to them and made the first time someone asks for one. This is the biggest
cost saving in the app.

## Readers without accounts

There's no sign-up. On the first request, `src/proxy.ts` sets a random UUID in an
httpOnly cookie, and likes, saves, collections, notes, dates and preferences are all
stored against that id.

Two details:

- Server Components can read cookies but can't set them, so the cookie is set in the
  proxy before the route renders. It's set on the request as well as the response, so
  the page rendering that same request can see it. Otherwise a new reader's very first
  like would go nowhere.
- The cookie comes from the client, so it's validated as a UUID and replaced if it
  isn't one. It's the key for every per-visitor row, so accepting any string would let
  someone write junk into it.

The downside is that it's per browser: saves don't follow you to your phone, and
clearing cookies resets everything. The upside is no sign-up, no password, no email and
no personal data.

For You takes stories from the other scopes in the categories the reader picked, then
moves up stories from categories or outlets they marked "interested". Stories marked
"not interested" are removed before selection so they don't take up a slot. No AI
needed.

## Reader and copyright

`article_content` stores the Readability output for every article (the same text used
for summaries).

Storing it doesn't mean we can show it. `fullTextOk` in `src/config/sources.ts` decides
per source whether the reader can show the full article, and it's false for every
source. None of these publishers allow republishing, and the wires are the strictest
about it. So the reader shows roughly the first third and then links to the publisher.
Reader pages are `noindex` with a canonical link to the original.

Publisher HTML isn't trusted. `src/lib/sanitize.ts` uses an allowlist (unknown tags,
unknown attributes and non-http(s) URLs are dropped), since it's rendered with
`dangerouslySetInnerHTML` on our domain.

## Search

Postgres full-text search on title + excerpt, with a GIN expression index. Queries go
through `websearch_to_tsquery`, so quotes, `OR` and `-word` work like people expect,
and the input is passed as a parameter.

Search ignores the scope, category and date filters on purpose, since searching only
inside today's India feed isn't very useful. It also skips the per-source cap, because
someone searching wants all the matches. Results are sorted by `ts_rank`, then date.

The index is in `drizzle/manual/0001_search_index.sql` because drizzle can't express an
index on `to_tsvector()`. The expression has to match the query exactly, otherwise
Postgres ignores the index and does a full scan.

## Month timeline

A bar per day of the current month, where height is that day's volume and a highlight
marks days that look like real events.

A day only counts if at least three different outlets covered the same story. Spam,
scraper loops or one publisher posting a lot all come from one or two sources, while
real news gets picked up widely. Using volume alone would flag random slow days.

The baseline is the median, not the mean, because one huge day would raise the mean and
hide the other spikes. With an AI key there's an extra check on the remaining days;
without one the rule-based result is used as is.

## Analytics

`/insights` and the notebook in `analysis/` read the same three SQL views
(`drizzle/manual/0002_analytics_views.sql`): one row per article, one per story, and
articles joined with their story's info. I put the cleaning rules there so I don't end
up with one definition in TypeScript and a slightly different one in pandas.

The views are in their own `analytics` schema so drizzle-kit ignores them, same idea as
the search index. If they haven't been created, `/insights` shows the command to create
them instead of crashing.

Some decisions:

- Speed uses the publisher's publish time, not `discovered_at`. The cron only runs once
  a day, so `discovered_at` mostly tells you when the cron ran. Publish times that are
  missing, just a date (midnight UTC or IST on the dot), in the future, or more than a
  week old get labelled and left out.
- "First to report" only counts stories at least two outlets covered. Otherwise an
  outlet that publishes a lot wins just by being the only one with most of its stories.
- Rates with fewer than `MIN_SAMPLE` stories behind them aren't shown.
- The views aren't materialized. It's fast enough at this size. If it gets slow,
  materializing `cluster_facts` and refreshing it after the cron would be the fix.

## Bugs that took a while

- The `react-hooks/purity` lint rule fails the build if you read the clock inside a
  component, Server Components included. Clock reads are in `src/lib/clock.ts`, done
  once per request and passed down, which also means every card on a page uses the same
  "now".
- Drizzle's raw SQL passes parameters straight to postgres-js, which only handles
  strings and buffers, so passing a `Date` throws. A JS array also turns into separate
  placeholders, so `= ANY(...)` fails with "requires array on right side".
- A month boundary in local time is 5.5 hours early in IST and drops the last evening
  of the month. Everything with dates uses UTC.
- Some publishers double-encode HTML entities in RSS titles. The XML parser only undoes
  one layer, React then escapes what's left, and you see `&amp;` on the page. 223 of
  3,827 titles had this.
- `drizzle-kit push` crashes on this database (0.31.10, on a CHECK constraint it can't
  parse). Migrations are generated and applied as guarded SQL instead.

## Folders

```
src/
  app/         routes, with server actions next to the page that uses them
  components/  UI; client components only where needed
  config/      sources, taxonomy, UI strings
  lib/         ingestion, ranking, classification, AI, data access
  scripts/     maintenance scripts, run with tsx
analysis/      Python analysis, report script and tests
docs/          this file and screenshots
drizzle/       migrations, schema snapshot, and hand-applied SQL in manual/
```

Anything you'd want to change without touching logic goes in `config/`: sources in
`sources.ts`, scopes, categories and keywords in `taxonomy.ts`, and all display text in
`ui-strings.ts`. Source names, category ids and English text aren't hardcoded in the
code.
