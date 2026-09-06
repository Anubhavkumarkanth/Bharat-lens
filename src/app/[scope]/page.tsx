import { notFound } from "next/navigation";
import { SCOPES, type Scope, type Category } from "@/config/taxonomy";
import { queryArticles, type RangeOption, type SortOption } from "@/lib/query";
import { getLang } from "@/lib/lang";
import { t } from "@/config/ui-strings";
import { FilterBar } from "@/components/filter-bar";
import { ArticleCard } from "@/components/article-card";

// News content is live/DB-backed and refreshed by the ingestion cron, never
// prebuilt at deploy time — see stack notes in CLAUDE.md.
export const dynamic = "force-dynamic";

export default async function ScopePage(props: PageProps<"/[scope]">) {
  const { scope } = await props.params;
  const searchParams = await props.searchParams;

  const scopeConfig = SCOPES.find((s) => s.id === scope);
  if (!scopeConfig) notFound();

  const lang = await getLang();

  if (scopeConfig.requiresAuth) {
    return (
      <div className="text-center py-24 text-muted">
        <p>{t("state.forYouLocked", lang)}</p>
      </div>
    );
  }

  const category = typeof searchParams.category === "string" ? (searchParams.category as Category) : undefined;
  const sort = (typeof searchParams.sort === "string" ? searchParams.sort : "newest") as SortOption;
  const range = (typeof searchParams.range === "string" ? searchParams.range : "1d") as RangeOption;

  const stories = await queryArticles({ scope: scope as Scope, category, sort, range });

  return (
    <div>
      <FilterBar lang={lang} />
      {stories.length === 0 ? (
        <p className="text-center py-24 text-muted">{t("state.empty", lang)}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {stories.map((story) => (
            <ArticleCard key={story.clusterId} story={story} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}
