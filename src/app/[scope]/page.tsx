import Link from "next/link";
import { notFound } from "next/navigation";
import { SCOPES, type Scope, type Category } from "@/config/taxonomy";
import { queryArticles, type RangeOption, type SortOption } from "@/lib/query";
import { getLang } from "@/lib/lang";
import { t } from "@/config/ui-strings";
import { getVisitorId } from "@/lib/visitor";
import { DEFAULT_PREFERENCES, SOURCE_SCOPES, getPreferences } from "@/lib/preferences";
import { getSavedArticleIds } from "@/lib/saved";
import { getInterestProfile, getReactionsFor, NO_REACTION } from "@/lib/reactions";
import { getMonthTimeline } from "@/lib/timeline";
import { currentMonthStartUtc, requestNow, todayUtcDate } from "@/lib/clock";
import { FilterBar } from "@/components/filter-bar";
import { MonthTimeline } from "@/components/month-timeline";
import { ArticleCard } from "@/components/article-card";

// News content is live/DB-backed and refreshed by the ingestion cron, never
// prebuilt at deploy time — see stack notes in CLAUDE.md.
export const dynamic = "force-dynamic";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center py-24 text-muted flex flex-col items-center gap-3 animate-rise">
      {children}
    </div>
  );
}

export default async function ScopePage(props: PageProps<"/[scope]">) {
  const { scope } = await props.params;
  const searchParams = await props.searchParams;

  const scopeConfig = SCOPES.find((s) => s.id === scope);
  if (!scopeConfig) notFound();

  const lang = await getLang();
  const visitorId = await getVisitorId();
  const prefs = visitorId ? await getPreferences(visitorId) : DEFAULT_PREFERENCES;

  const category = typeof searchParams.category === "string" ? (searchParams.category as Category) : undefined;
  // An explicit URL choice always wins; otherwise the reader gets the sort and
  // range saved against their cookie, and a brand-new visitor the app defaults.
  const sort = (typeof searchParams.sort === "string" ? searchParams.sort : prefs.defaultSort) as SortOption;
  const range = (typeof searchParams.range === "string" ? searchParams.range : prefs.defaultRange) as RangeOption;
  const day = typeof searchParams.day === "string" ? searchParams.day : undefined;

  // For You needs categories to build from; it is open to everyone otherwise.
  if (scopeConfig.personal && prefs.categories.length === 0) {
    return (
      <Notice>
        <p>{t("state.forYouNoPrefs", lang)}</p>
        <Link href="/preferences" className="text-accent hover:underline">
          {t("prefs.title", lang)}
        </Link>
      </Notice>
    );
  }

  const interest = visitorId ? await getInterestProfile(visitorId) : null;

  // The scopes this page draws from — the timeline has to measure the same pool
  // the feed does, or a marked day wouldn't match what clicking it shows.
  const feedScopes = scopeConfig.personal
    ? prefs.scopes.length > 0
      ? prefs.scopes
      : SOURCE_SCOPES
    : [scope as Scope];

  const timeline = await getMonthTimeline(feedScopes, currentMonthStartUtc());

  // For You is the same deterministic pipeline as every other feed, just pointed
  // at the reader's chosen scopes and categories — no AI, so it works with no keys.
  let stories = scopeConfig.personal
    ? await queryArticles({
        scope: feedScopes,
        category: category ?? prefs.categories,
        sort,
        range,
        day,
        excludeArticleIds: interest?.excludedArticleIds,
      })
    : await queryArticles({ scope: scope as Scope, category, sort, range, day });

  // Stories from a category or outlet they marked "interested" float to the top
  // of the day's queue. Stable partition, so the chosen sort still holds within
  // each half — this reorders the selection rather than replacing the ranking.
  if (scopeConfig.personal && interest) {
    const boosted = (s: (typeof stories)[number]) =>
      interest.boostedCategories.has(s.category) || interest.boostedSources.has(s.sourceId);
    stories = [...stories.filter(boosted), ...stories.filter((s) => !boosted(s))];
  }

  const [savedIds, reactions] = await Promise.all([
    visitorId ? getSavedArticleIds(visitorId) : Promise.resolve(new Set<string>()),
    visitorId
      ? getReactionsFor(
          visitorId,
          stories.map((s) => s.id)
        )
      : Promise.resolve(new Map()),
  ]);

  // One clock reading for every card on the page.
  const now = requestNow();

  /** Current query string with the given keys replaced, or removed when null. */
  function withParams(changes: Record<string, string | null>): string {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (typeof searchParams.sort === "string") params.set("sort", searchParams.sort);
    if (typeof searchParams.range === "string") params.set("range", searchParams.range);
    if (day) params.set("day", day);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    return query ? `/${scope}?${query}` : `/${scope}`;
  }

  return (
    <div>
      <MonthTimeline days={timeline} lang={lang} today={todayUtcDate()} activeDay={day} />
      <FilterBar lang={lang} sort={sort} range={range} />
      {stories.length === 0 ? (
        // A dead-end empty state is the worst thing a reader can hit, and with a
        // once-a-day cron the default 24h window is empty more often than not.
        // Offer the filters that are actually narrowing it, widest-first.
        <Notice>
          <p>{t("state.empty", lang)}</p>
          <div className="flex flex-wrap gap-3 justify-center text-sm">
            {day && (
              <Link href={withParams({ day: null })} className="text-accent hover:underline">
                {t("state.emptyClearDay", lang)}
              </Link>
            )}
            {category && (
              <Link href={withParams({ category: null })} className="text-accent hover:underline">
                {t("state.emptyClearCategory", lang)}
              </Link>
            )}
            {range !== "year" && (
              <Link
                href={withParams({ range: "year", day: null })}
                className="text-accent hover:underline"
              >
                {t("state.emptyWiden", lang)}
              </Link>
            )}
          </div>
        </Notice>
      ) : (
        // Two columns from lg up: a single narrow column in a wide window is
        // what made the feed look empty.
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          {stories.map((story, index) => (
            <ArticleCard
              key={story.clusterId}
              story={story}
              lang={lang}
              now={now}
              index={index}
              saved={savedIds.has(story.id)}
              reaction={reactions.get(story.id) ?? NO_REACTION}
            />
          ))}
        </div>
      )}
    </div>
  );
}
