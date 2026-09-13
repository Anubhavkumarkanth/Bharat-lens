import { getVisitorId } from "@/lib/visitor";
import { DEFAULT_PREFERENCES, getPreferences } from "@/lib/preferences";
import { getLang } from "@/lib/lang";
import { t } from "@/config/ui-strings";
import { PreferencesForm } from "@/components/preferences-form";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const lang = await getLang();
  const visitorId = await getVisitorId();

  // No sign-in to redirect to. Without a cookie there is simply nothing stored,
  // so the form renders at its defaults.
  const prefs = visitorId ? await getPreferences(visitorId) : DEFAULT_PREFERENCES;

  return (
    <div className="max-w-2xl animate-rise">
      <h1 className="font-serif text-3xl mb-2">{t("prefs.title", lang)}</h1>
      <p className="text-sm text-muted mb-8">{t("prefs.localNote", lang)}</p>
      <PreferencesForm lang={lang} prefs={prefs} />
    </div>
  );
}
