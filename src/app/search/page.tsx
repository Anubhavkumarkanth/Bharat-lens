import { searchArticles } from "@/lib/query";
import { getLang } from "@/lib/lang";
import { t } from "@/config/ui-strings";
import { getVisitorId } from "@/lib/visitor";
import { getSavedArticleIds } from "@/lib/saved";
import { getReactionsFor, NO_REACTION } from "@/lib/reactions";
import { requestNow } from "@/lib/clock";
import { ArticleCard } from "@/components/article-card";

export const dynamic = "force-dynamic";

export default async function SearchPage(props: PageProps<"/search">) {
  const lang = await getLang();
  const searchParams = await props.searchParams;
  const query = typeof searchParams.q === "string" ? searchParams.q : "";

  const now = requestNow();
  const stories = query ? await searchArticles(query, now) : [];

  const visitorId = await getVisitorId();
  const [savedIds, reactions] = await Promise.all([
    visitorId ? getSavedArticleIds(visitorId) : Promise.resolve(new Set<string>()),
    visitorId
      ? getReactionsFor(
          visitorId,
          stories.map((s) => s.id)
        )
      : Promise.resolve(new Map()),
  ]);

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-serif text-3xl">
          {query ? `“${query}”` : t("search.title", lang)}
        </h1>
        <p className="text-sm text-muted mt-1">
          {query
            ? `${stories.length} ${t("search.resultCount", lang)}`
            : t("search.prompt", lang)}
        </p>
      </div>

      {query && stories.length === 0 ? (
        <p className="text-center py-24 text-muted">{t("search.noResults", lang)}</p>
      ) : (
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
