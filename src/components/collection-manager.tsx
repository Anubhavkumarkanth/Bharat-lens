"use client";

import { useActionState } from "react";
import { createCollection, type SavedFormState } from "@/app/saved/actions";
import { t, type Lang } from "@/config/ui-strings";

export function CollectionManager({ lang }: { lang: Lang }) {
  const [state, formAction, pending] = useActionState<SavedFormState, FormData>(
    createCollection,
    {}
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        name="name"
        required
        maxLength={60}
        placeholder={t("saved.newCollection", lang)}
        className="border border-border rounded-md bg-surface px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:text-foreground text-muted disabled:opacity-60"
      >
        {t("saved.createCollection", lang)}
      </button>
      {state.error && <span className="text-sm text-red-500">{state.error}</span>}
    </form>
  );
}
