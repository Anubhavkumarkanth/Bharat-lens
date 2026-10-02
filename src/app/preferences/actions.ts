"use server";

import { revalidatePath } from "next/cache";
import { getVisitorId } from "@/lib/visitor";
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
  const visitorId = await getVisitorId();
  if (!visitorId) return { error: t("prefs.noCookie", lang) };

  // savePreferences drops ids that aren't in the taxonomy
  await savePreferences(visitorId, {
    categories: formData.getAll("categories").map(String) as Category[],
    scopes: formData.getAll("scopes").map(String) as Scope[],
    defaultSort: String(formData.get("defaultSort") ?? "newest") as SortOption,
    defaultRange: String(formData.get("defaultRange") ?? "1d") as RangeOption,
  });

  revalidatePath("/preferences");
  revalidatePath("/for-you");
  return { notice: t("prefs.saved", lang) };
}
