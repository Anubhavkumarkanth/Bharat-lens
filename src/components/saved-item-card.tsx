import { t, type Lang, type UiStringKey } from "@/config/ui-strings";
import { removeSaved, setArchived, updateSavedItem } from "@/app/saved/actions";
import type { Collection, SavedItem } from "@/lib/saved";

/** `<input type="date">` wants YYYY-MM-DD; anything else silently renders blank. */
function dateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function SavedItemCard({
  item,
  collections,
  lang,
}: {
  item: SavedItem;
  collections: Collection[];
  lang: Lang;
}) {
  const categoryLabel = t(`category.${item.category}` as UiStringKey, lang);
  const archived = item.archivedAt !== null;
  const overdue = item.overdue;

  return (
    <article className="border border-border rounded-lg bg-surface p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
        <span className="uppercase tracking-wide font-medium text-accent">{categoryLabel}</span>
        <span>·</span>
        <span>{item.sourceName}</span>
        {overdue && !archived && (
          <>
            <span>·</span>
            <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent">
              {t("saved.overdue", lang)}
            </span>
          </>
        )}
      </div>

      <h2 className="font-serif text-lg leading-snug">
        <a href={item.canonicalUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {item.title}
        </a>
      </h2>

      <form action={updateSavedItem} className="flex flex-col gap-3">
        <input type="hidden" name="savedId" value={item.id} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted text-xs">{t("saved.note", lang)}</span>
          <textarea
            name="note"
            rows={2}
            defaultValue={item.note ?? ""}
            placeholder={t("saved.notePlaceholder", lang)}
            className="border border-border rounded-md bg-background px-3 py-2 text-sm"
          />
        </label>

        <div className="flex flex-wrap gap-4 items-end text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-muted text-xs">{t("saved.remindAt", lang)}</span>
            <input
              type="date"
              name="remindAt"
              defaultValue={dateInputValue(item.remindAt)}
              className="border border-border rounded-md bg-background px-2 py-1"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-muted text-xs">{t("saved.collection", lang)}</span>
            <select
              name="collectionId"
              defaultValue={item.collectionId ?? ""}
              className="border border-border rounded-md bg-background px-2 py-1"
            >
              <option value="">{t("saved.noCollection", lang)}</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-muted hover:text-foreground"
          >
            {t("saved.update", lang)}
          </button>
        </div>
      </form>

      <div className="flex gap-3 pt-2 border-t border-border text-sm">
        <a
          href={item.canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          {t("action.readOriginal", lang)} →
        </a>
        <span className="flex-1" />
        <form action={setArchived}>
          <input type="hidden" name="savedId" value={item.id} />
          <input type="hidden" name="archived" value={archived ? "false" : "true"} />
          <button type="submit" className="text-muted hover:text-foreground">
            {t(archived ? "saved.unarchive" : "saved.archive", lang)}
          </button>
        </form>
        <form action={removeSaved}>
          <input type="hidden" name="savedId" value={item.id} />
          <button type="submit" className="text-muted hover:text-foreground">
            {t("saved.remove", lang)}
          </button>
        </form>
      </div>
    </article>
  );
}
