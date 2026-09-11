"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getProfileByHandle, normalizeSocialUrl, slugifyHandle } from "@/lib/profiles";
import { savePreferences } from "@/lib/preferences";
import type { Category, Scope } from "@/config/taxonomy";
import type { RangeOption, SortOption } from "@/lib/query";
import { getLang } from "@/lib/lang";
import { t } from "@/config/ui-strings";

export interface PreferencesFormState {
  notice?: string;
  error?: string;
}

export async function updatePreferences(
  _prev: PreferencesFormState,
  formData: FormData
): Promise<PreferencesFormState> {
  const lang = await getLang();
  const user = await getCurrentUser();
  if (!user) return { error: t("auth.signInToContinue", lang) };

  // savePreferences validates every id against the taxonomy, so unchecked
  // values arriving from a hand-edited form are dropped rather than stored.
  await savePreferences(user.id, {
    categories: formData.getAll("categories").map(String) as Category[],
    scopes: formData.getAll("scopes").map(String) as Scope[],
    defaultSort: String(formData.get("defaultSort") ?? "newest") as SortOption,
    defaultRange: String(formData.get("defaultRange") ?? "1d") as RangeOption,
  });

  revalidatePath("/preferences");
  revalidatePath("/for-you");
  return { notice: t("prefs.saved", lang) };
}

export interface ProfileFormState {
  notice?: string;
  error?: string;
}

/**
 * Public profile. The handle becomes a public URL segment and the two social
 * links render as anchors on a page anyone can open, so both are normalized and
 * host-checked here rather than trusted from the form.
 */
export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const lang = await getLang();
  const user = await getCurrentUser();
  if (!user) return { error: t("auth.signInToContinue", lang) };

  const requested = slugifyHandle(String(formData.get("handle") ?? ""));
  const handle = requested || slugifyHandle(user.email?.split("@")[0] ?? "") || "reader";

  const owner = await getProfileByHandle(handle);
  if (owner && owner.userId !== user.id) return { error: t("profile.handleTaken", lang) };

  const instagramRaw = String(formData.get("instagramUrl") ?? "");
  const xRaw = String(formData.get("xUrl") ?? "");
  const instagramUrl = instagramRaw.trim() ? normalizeSocialUrl(instagramRaw, "instagram") : null;
  const xUrl = xRaw.trim() ? normalizeSocialUrl(xRaw, "x") : null;

  if ((instagramRaw.trim() && !instagramUrl) || (xRaw.trim() && !xUrl)) {
    return { error: t("profile.invalidSocial", lang) };
  }

  const row = {
    handle,
    displayName: String(formData.get("displayName") ?? "").trim() || null,
    bio: String(formData.get("bio") ?? "").trim() || null,
    instagramUrl,
    xUrl,
  };

  await db
    .insert(profiles)
    .values({ userId: user.id, ...row })
    .onConflictDoUpdate({ target: profiles.userId, set: row });

  revalidatePath("/preferences");
  revalidatePath(`/u/${handle}`);
  return { notice: t("profile.saved", lang) };
}
