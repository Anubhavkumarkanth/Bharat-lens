import Link from "next/link";
import { notFound } from "next/navigation";
import { SCOPES, type Scope, type Category } from "@/config/taxonomy";
import {
  PAGE_SIZE,
  queryArticles,
  type RangeOption,
  type SortOption,
  type StoryCard,
} from "@/lib/query";
import { getLang } from "@/lib/lang";
import { t } from "@/config/ui-strings";
import { getVisitorId } from "@/lib/visitor";
import { tryDb } from "@/lib/db/availability";
import { DEFAULT_PREFERENCES, SOURCE_SCOPES, getPreferences } from "@/lib/preferences";
import { getSavedArticleIds } from "@/lib/saved";
import { getInterestProfile, getReactionsFor, NO_REACTION } from "@/lib/reactions";
import { getMonthTimeline } from "@/lib/timeline";
import { currentMonthStartUtc, requestNow, todayUtcDate } from "@/lib/clock";
import { FilterBar } from "@/components/filter-bar";
import { MonthTimeline } from "@/components/month-timeline";
import { ArticleCard } from "@/components/article-card";

// Reads from the DB on every request, nothing is prebuilt.
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
  const prefs =
    (visitorId ? await tryDb(() => getPreferences(visitorId)) : null) ?? DEFAULT_PREFERENCES;

  const category = typeof searchParams.category === "string" ? (searchParams.category as Category) : undefined;
  // URL params first, then saved preferences, then defaults
  const sort = (typeof searchParams.sort === "string" ? searchParams.sort : prefs.defaultSort) as SortOption;
  const range = (typeof searchParams.range === "string" ? searchParams.range : prefs.defaultRange) as RangeOption;
  const day = typeof searchParams.day === "string" ? searchParams.day : undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);

  // For You needs at least one category
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

  const interest = visitorId ? await tryDb(() => getInterestProfile(visitorId)) : null;

  // the timeline uses the same scopes as the feed
  const feedScopes = scopeConfig.personal
    ? prefs.scopes.length > 0
      ? prefs.scopes
      : SOURCE_SCOPES
    : [scope as Scope];

  const timeline = (await tryDb(() => getMonthTimeline(feedScopes, currentMonthStartUtc()))) ?? [];

  // For You is the normal feed query with the reader's scopes and categories
  // null here means the database could not be reached, which is a different
  // thing from an empty result and must not be reported as "no stories".
  let stories = await tryDb(() =>
    scopeConfig.personal
      ? queryArticles({
          scope: feedScopes,
          category: category ?? prefs.categories,
          sort,
          range,
          day,
          page,
          excludeArticleIds: interest?.excludedArticleIds,
        })
      : queryArticles({ scope: scope as Scope, category, sort, range, day, page })
  );

  if (stories === null) {
    return (
      <Notice>
        <p className="text-foreground">{t("state.offline", lang)}</p>
        <p className="text-sm">{t("state.offlineHint", lang)}</p>
      </Notice>
    );
  }

  // Move "interested" categories/outlets to the top, keeping the sort order
  // within each group.
  if (scopeConfig.personal && interest) {
    const boosted = (s: StoryCard) =>
      interest.boostedCategories.has(s.category) || interest.boostedSources.has(s.sourceId);
    stories = [...stories.filter(boosted), ...stories.filter((s) => !boosted(s))];
  }

  const [savedIds, reactions] = await Promise.all([
    visitorId ? tryDb(() => getSavedArticleIds(visitorId)) : null,
    visitorId ? tryDb(() => getReactionsFor(visitorId, stories.map((s) => s.id))) : null,
  ]);

  // same "now" for every card
  const now = requestNow();

  // current query string with some keys changed (null removes)
  function withParams(changes: Record<string, string | null>): string {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (typeof searchParams.sort === "string") params.set("sort", searchParams.sort);
    if (typeof searchParams.range === "string") params.set("range", searchParams.range);
    if (day) params.set("day", day);
    if (page > 1) params.set("page", String(page));
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
        // With a daily cron the 1 day view is often empty, so offer ways to widen it
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
        // two columns on large screens
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          {stories.map((story, index) => (
            <ArticleCard
              key={story.clusterId}
              story={story}
              lang={lang}
              now={now}
              index={index}
              saved={savedIds?.has(story.id) ?? false}
              reaction={reactions?.get(story.id) ?? NO_REACTION}
            />
          ))}
        </div>
      )}

      {/* Show "more" if this page is full. Not worth a count query. */}
      {stories.length > 0 && (page > 1 || stories.length === PAGE_SIZE) && (
        <nav className="flex items-center justify-between gap-4 mt-10 pt-6 border-t border-border text-sm">
          {page > 1 ? (
            <Link
              href={withParams({ page: page === 2 ? null : String(page - 1) })}
              className="text-accent hover:underline"
            >
              ← {t("page.back", lang)}
            </Link>
          ) : (
            <span />
          )}

          <span className="text-muted text-xs">
            {t("page.number", lang)} {page}
          </span>

          {stories.length === PAGE_SIZE ? (
            <Link
              href={withParams({ page: String(page + 1) })}
              className="text-accent hover:underline"
            >
              {t("page.more", lang)} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
