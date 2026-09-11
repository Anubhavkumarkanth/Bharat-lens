import Link from "next/link";
import type { StoryCard } from "@/lib/query";
import { t, type Lang, type UiStringKey } from "@/config/ui-strings";
import { getOrTranslateSummary } from "@/lib/translate";
import { ArticleActions } from "@/components/article-actions";
import { NO_REACTION, type Reaction } from "@/lib/reactions";

function timeAgo(date: Date, now: number, lang: Lang): string {
  const mins = Math.max(1, Math.round((now - date.getTime()) / 60000));
  if (mins < 60) return lang === "hi" ? `${mins} मिनट पहले` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return lang === "hi" ? `${hours} घंटे पहले` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return lang === "hi" ? `${days} दिन पहले` : `${days}d ago`;
}

export async function ArticleCard({
  story,
  lang,
  now,
  index = 0,
  signedIn = false,
  saved = false,
  reposted = false,
  reaction = NO_REACTION,
}: {
  story: StoryCard;
  lang: Lang;
  /** Single clock reading from the page, so cards stay pure and agree with each other. */
  now: number;
  index?: number;
  signedIn?: boolean;
  saved?: boolean;
  reposted?: boolean;
  reaction?: Reaction;
}) {
  const categoryLabel = t(`category.${story.category}` as UiStringKey, lang);
  const summary =
    lang === "hi" && story.grounded && story.summaryEn
      ? await getOrTranslateSummary(story.id)
      : story.summaryEn;

  return (
    <article
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-card transition-all duration-300 hover:shadow-lift hover:-translate-y-0.5 hover:border-border-strong animate-rise"
      // Staggered entrance, capped so the last card in a long feed isn't left waiting.
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
        <span className="rounded-full bg-accent-soft px-2 py-0.5 uppercase tracking-wider font-medium text-accent">
          {categoryLabel}
        </span>
        {story.contentType === "opinion" && (
          <span className="px-1.5 py-0.5 rounded-full border border-border">
            {t("state.opinion", lang)}
          </span>
        )}
        {story.isNew && (
          <span className="relative flex items-center gap-1 text-accent font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" aria-hidden="true" />
            {lang === "hi" ? "नया" : "New"}
          </span>
        )}
        <span aria-hidden="true">·</span>
        <span className="font-medium text-foreground/70">{story.sourceName}</span>
        <span aria-hidden="true">·</span>
        <time>{timeAgo(story.publishedAt ?? story.discoveredAt, now, lang)}</time>
      </div>

      <h2 className="font-serif text-xl sm:text-[1.375rem] leading-[1.3]">
        <Link href={`/article/${story.id}`} className="hover:text-accent transition-colors">
          {story.title}
        </Link>
      </h2>

      {story.byline && <p className="text-xs text-muted -mt-1">{story.byline}</p>}

      {summary ? (
        <p className="text-sm leading-relaxed text-foreground/80">{summary}</p>
      ) : (
        <p className="text-sm italic text-muted">{t("state.headlineOnly", lang)}</p>
      )}

      {/* Both ways in, side by side — read it here, or go to the publisher. */}
      <div className="flex items-center gap-4 text-sm pt-1">
        <Link
          href={`/article/${story.id}`}
          className="font-medium text-accent hover:underline underline-offset-4"
        >
          {t("action.readHere", lang)}
        </Link>
        <a
          href={story.canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted hover:text-foreground transition-colors"
        >
          {t("action.readOriginal", lang)} ↗
        </a>
      </div>

      <div className="pt-2 border-t border-border">
        <ArticleActions
          articleId={story.id}
          signedIn={signedIn}
          lang={lang}
          initial={{
            liked: reaction.liked,
            interest: reaction.interest,
            saved,
            reposted,
          }}
        />
      </div>

      {story.otherOutlets.length > 0 && (
        <details className="text-xs text-muted group/details">
          <summary className="cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1">
            <span className="transition-transform duration-200 group-open/details:rotate-90" aria-hidden="true">
              ›
            </span>
            {t("action.alsoReportedBy", lang)} {story.otherOutlets.map((o) => o.sourceName).join(", ")}
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {story.otherOutlets.map((o) => (
              <li key={o.url}>
                <a href={o.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                  {o.sourceName}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
