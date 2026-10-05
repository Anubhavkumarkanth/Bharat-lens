import { getVisitorId } from "@/lib/visitor";
import { tryDb } from "@/lib/db/availability";
import { DEFAULT_PREFERENCES, getPreferences } from "@/lib/preferences";
import { getLang } from "@/lib/lang";
import { t } from "@/config/ui-strings";
import { PreferencesForm } from "@/components/preferences-form";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const lang = await getLang();
  const visitorId = await getVisitorId();

  // no cookie = defaults
  const stored = visitorId ? await tryDb(() => getPreferences(visitorId)) : DEFAULT_PREFERENCES;

  // Showing the form at defaults during an outage would invite the reader to
  // save over settings we simply could not read.
  if (stored === null) {
    return (
      <div className="text-center py-24 text-muted flex flex-col items-center gap-2">
        <p className="text-foreground">{t("state.offline", lang)}</p>
        <p className="text-sm">{t("state.offlineHint", lang)}</p>
      </div>
    );
  }

  const prefs = stored;

  return (
    <div className="max-w-2xl animate-rise">
      <h1 className="font-serif text-3xl mb-2">{t("prefs.title", lang)}</h1>
      <p className="text-sm text-muted mb-8">{t("prefs.localNote", lang)}</p>
      <PreferencesForm lang={lang} prefs={prefs} />
    </div>
  );
}
