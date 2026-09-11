"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateProfile, type ProfileFormState } from "@/app/preferences/actions";
import { t, type Lang } from "@/config/ui-strings";
import type { Profile } from "@/lib/profiles";

export function ProfileForm({ lang, profile }: { lang: Lang; profile: Profile | null }) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    updateProfile,
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1 text-sm max-w-sm">
        <span className="text-muted">{t("profile.handle", lang)}</span>
        <div className="flex items-center rounded-lg border border-border bg-surface overflow-hidden">
          <span className="pl-3 pr-1 text-muted text-sm select-none">/u/</span>
          <input
            type="text"
            name="handle"
            maxLength={24}
            defaultValue={profile?.handle ?? ""}
            className="flex-1 bg-transparent py-2 pr-3 outline-none"
          />
        </div>
      </label>

      <label className="flex flex-col gap-1 text-sm max-w-sm">
        <span className="text-muted">{t("profile.displayName", lang)}</span>
        <input
          type="text"
          name="displayName"
          maxLength={60}
          defaultValue={profile?.displayName ?? ""}
          className="rounded-lg border border-border bg-surface px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm max-w-lg">
        <span className="text-muted">{t("profile.bio", lang)}</span>
        <textarea
          name="bio"
          rows={2}
          maxLength={200}
          defaultValue={profile?.bio ?? ""}
          className="rounded-lg border border-border bg-surface px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{t("profile.instagram", lang)}</span>
          <input
            type="text"
            name="instagramUrl"
            placeholder="@handle"
            defaultValue={profile?.instagramUrl ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{t("profile.x", lang)}</span>
          <input
            type="text"
            name="xUrl"
            placeholder="@handle"
            defaultValue={profile?.xUrl ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2"
          />
        </label>
      </div>
      <p className="text-xs text-muted -mt-2">{t("profile.socialHint", lang)}</p>

      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state.notice && <p className="text-sm text-accent">{state.notice}</p>}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-full bg-accent hover:bg-accent-hover text-white px-5 py-2 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {t("profile.save", lang)}
        </button>
        {profile && (
          <Link href={`/u/${profile.handle}`} className="text-sm text-accent hover:underline">
            {t("profile.view", lang)} →
          </Link>
        )}
      </div>
    </form>
  );
}
