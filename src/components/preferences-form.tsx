"use client";

import { useActionState } from "react";
import { updatePreferences, type PreferencesFormState } from "@/app/preferences/actions";
import { CATEGORIES, SCOPES } from "@/config/taxonomy";
import { t, type Lang, type UiStringKey } from "@/config/ui-strings";
import type { ReaderPreferences } from "@/lib/preferences";
import type { RangeOption, SortOption } from "@/lib/query";

const SORTS: SortOption[] = ["newest", "trending", "popular", "oldest"];
const RANGES: RangeOption[] = ["live", "1d", "week", "month", "past-month", "year"];

export function PreferencesForm({ lang, prefs }: { lang: Lang; prefs: ReaderPreferences }) {
  const [state, formAction, pending] = useActionState<PreferencesFormState, FormData>(
    updatePreferences,
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm text-muted mb-2">{t("prefs.categories", lang)}</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2 border border-border rounded-full px-3 py-1.5 text-sm cursor-pointer has-checked:bg-accent has-checked:text-white has-checked:border-accent"
            >
              <input
                type="checkbox"
                name="categories"
                value={c.id}
                defaultChecked={prefs.categories.includes(c.id)}
                className="sr-only"
              />
              {t(`category.${c.id}` as UiStringKey, lang)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm text-muted mb-2">{t("prefs.scopes", lang)}</legend>
        <div className="flex flex-wrap gap-2">
          {SCOPES.filter((s) => !s.personal).map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 border border-border rounded-full px-3 py-1.5 text-sm cursor-pointer has-checked:bg-accent has-checked:text-white has-checked:border-accent"
            >
              <input
                type="checkbox"
                name="scopes"
                value={s.id}
                defaultChecked={prefs.scopes.includes(s.id)}
                className="sr-only"
              />
              {t(`scope.${s.id}` as UiStringKey, lang)}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">{t("prefs.scopesHint", lang)}</p>
      </fieldset>

      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("prefs.defaultSort", lang)}</span>
          <select
            name="defaultSort"
            defaultValue={prefs.defaultSort}
            className="border border-border rounded-md bg-surface px-2 py-1"
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}` as UiStringKey, lang)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("prefs.defaultRange", lang)}</span>
          <select
            name="defaultRange"
            defaultValue={prefs.defaultRange}
            className="border border-border rounded-md bg-surface px-2 py-1"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {t(`range.${r}` as UiStringKey, lang)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state.notice && <p className="text-sm text-accent">{state.notice}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-accent text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {t("prefs.save", lang)}
      </button>
    </form>
  );
}
