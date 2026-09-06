import type { StoryCard } from "@/lib/query";
import { CATEGORIES } from "@/config/taxonomy";
import { t, type Lang } from "@/config/ui-strings";
import { getOrTranslateSummary } from "@/lib/translate";

function timeAgo(date: Date, lang: Lang): string {
  const mins = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (mins < 60) return lang === "hi" ? `${mins} मिनट पहले` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return lang === "hi" ? `${hours} घंटे पहले` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return lang === "hi" ? `${days} दिन पहले` : `${days}d ago`;
}

export async function ArticleCard({ story, lang }: { story: StoryCard; lang: Lang }) {
  const categoryLabel = CATEGORIES.find((c) => c.id === story.category)?.label ?? story.category;
  const summary =
    lang === "hi" && story.grounded && story.summaryEn
      ? await getOrTranslateSummary(story.id)
      : story.summaryEn;

  return (
    <article className="border border-border rounded-lg bg-surface p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
        <span className="uppercase tracking-wide font-medium text-accent">{categoryLabel}</span>
        {story.contentType === "opinion" && (
          <span className="px-1.5 py-0.5 rounded border border-border">{t("state.opinion", lang)}</span>
        )}
        {story.isNew && <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent">{lang === "hi" ? "नया" : "New"}</span>}
        <span>·</span>
        <span>{story.sourceName}</span>
        <span>·</span>
        <time>{timeAgo(story.publishedAt ?? story.discoveredAt, lang)}</time>
      </div>

      <h2 className="font-serif text-xl leading-snug">
        <a href={story.canonicalUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {story.title}
        </a>
      </h2>

      {story.byline && <p className="text-xs text-muted">{story.byline}</p>}

      {summary ? (
        <p className="text-sm leading-relaxed text-foreground/90">{summary}</p>
      ) : (
        <p className="text-sm italic text-muted">{t("state.headlineOnly", lang)}</p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
        <a href={story.canonicalUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          {t("action.readOriginal", lang)} →
        </a>
        <button
          type="button"
          title="Sign in to save articles (Phase 2)"
          className="text-muted hover:text-foreground cursor-not-allowed"
          disabled
        >
          {t("action.save", lang)}
        </button>
      </div>

      {story.otherOutlets.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer hover:text-foreground">
            {t("action.alsoReportedBy", lang)} {story.otherOutlets.map((o) => o.sourceName).join(", ")}
          </summary>
          <ul className="mt-2 space-y-1">
            {story.otherOutlets.map((o) => (
              <li key={o.url}>
                <a href={o.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
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
