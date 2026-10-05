import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticleDetail } from "@/lib/article";
import { leadIn, readingMinutes, sanitizeArticleHtml } from "@/lib/sanitize";
import { getVisitorId } from "@/lib/visitor";
import { tryDb } from "@/lib/db/availability";
import { getReactionsFor, NO_REACTION } from "@/lib/reactions";
import { getSavedArticleIds } from "@/lib/saved";
import { getOrTranslateSummary } from "@/lib/translate";
import { getLang } from "@/lib/lang";
import { t, type UiStringKey } from "@/config/ui-strings";
import { ArticleActions } from "@/components/article-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/article/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  // Runs before the page body, so an unguarded throw here 500s the route no
  // matter how carefully the body degrades.
  const article = await tryDb(() => getArticleDetail(id));
  if (!article) return {};

  return {
    title: `${article.title} | Bharat Lens`,
    // not our article: noindex, canonical to the publisher
    alternates: { canonical: article.canonicalUrl },
    robots: { index: false, follow: false },
  };
}

export default async function ArticlePage(props: PageProps<"/article/[id]">) {
  const { id } = await props.params;
  const lang = await getLang();

  // Wrapped in an object so "database unreachable" (null from tryDb) stays
  // distinguishable from "no such article" (null inside it). Collapsing the two
  // would answer 404 during an outage, telling readers and search engines the
  // article does not exist when it does.
  const found = await tryDb(async () => ({ article: await getArticleDetail(id) }));

  if (found === null) {
    return (
      <div className="text-center py-24 text-muted flex flex-col items-center gap-2">
        <p className="text-foreground">{t("state.offline", lang)}</p>
        <p className="text-sm">{t("state.offlineHint", lang)}</p>
      </div>
    );
  }

  const article = found.article;
  if (!article) notFound();

  const visitorId = await getVisitorId();

  const [reactions, savedIds] = await Promise.all([
    visitorId ? tryDb(() => getReactionsFor(visitorId, [article.id])) : null,
    visitorId ? tryDb(() => getSavedArticleIds(visitorId)) : null,
  ]);
  const reaction = reactions?.get(article.id) ?? NO_REACTION;

  const summary =
    lang === "hi" && article.grounded && article.summaryEn
      ? await getOrTranslateSummary(article.id)
      : article.summaryEn;

  const categoryLabel = t(`category.${article.category}` as UiStringKey, lang);

  // sanitize, then cut to what the source allows
  const clean = article.html ? sanitizeArticleHtml(article.html, article.canonicalUrl) : null;
  const body = clean ? (article.fullTextOk ? clean : leadIn(clean)) : null;

  return (
    <article className="max-w-2xl mx-auto animate-rise">
      <div className="flex items-center gap-2 text-xs text-muted flex-wrap mb-4">
        <span className="uppercase tracking-wider font-medium text-accent">{categoryLabel}</span>
        <span aria-hidden="true">·</span>
        <span>{article.sourceName}</span>
        {article.wordCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {readingMinutes(article.wordCount)} {t("reader.minRead", lang)}
            </span>
          </>
        )}
      </div>

      <h1 className="font-serif text-3xl sm:text-4xl leading-[1.15] mb-4">{article.title}</h1>

      {article.byline && <p className="text-sm text-muted mb-6">{article.byline}</p>}

      {summary && (
        <p className="text-base leading-relaxed text-foreground/90 border-l-2 border-accent pl-4 mb-8">
          {summary}
        </p>
      )}

      <div className="mb-8 pb-6 border-b border-border">
        <ArticleActions
          articleId={article.id}
          lang={lang}
          initial={{
            liked: reaction.liked,
            interest: reaction.interest,
            saved: savedIds?.has(article.id) ?? false,
          }}
        />
      </div>

      {body ? (
        <div
          className="reader-body font-serif text-[1.0625rem] leading-[1.75] text-foreground/95"
          dangerouslySetInnerHTML={{ __html: body }}
        />
      ) : (
        <p className="text-muted italic">{t("reader.noContent", lang)}</p>
      )}

      {/* Only show the copyright note if we actually showed some text. */}
      {body && !article.fullTextOk ? (
        <aside className="mt-10 rounded-2xl border border-border bg-accent-soft/60 p-5">
          <p className="font-medium mb-1.5">{t("reader.copyrightTitle", lang)}</p>
          <p className="text-sm text-muted leading-relaxed mb-4">{t("reader.copyrightBody", lang)}</p>
          <a
            href={article.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-accent hover:bg-accent-hover text-on-accent px-4 py-2 text-sm font-medium transition-colors"
          >
            {t("reader.continueAt", lang)} {article.sourceName} →
          </a>
        </aside>
      ) : (
        <a
          href={article.canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-accent hover:bg-accent-hover text-on-accent px-4 py-2 text-sm font-medium transition-colors"
        >
          {t("reader.continueAt", lang)} {article.sourceName} →
        </a>
      )}
    </article>
  );
}
