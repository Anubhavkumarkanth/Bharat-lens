import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPreferences } from "@/lib/preferences";
import { getProfileByUserId } from "@/lib/profiles";
import { getLang } from "@/lib/lang";
import { t } from "@/config/ui-strings";
import { PreferencesForm } from "@/components/preferences-form";
import { ProfileForm } from "@/components/profile-form";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const lang = await getLang();
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const [prefs, profile] = await Promise.all([
    getPreferences(user.id),
    getProfileByUserId(user.id),
  ]);

  return (
    <div className="max-w-2xl animate-rise">
      <h1 className="font-serif text-3xl mb-8">{t("prefs.title", lang)}</h1>
      <PreferencesForm lang={lang} prefs={prefs} />

      <hr className="my-12 border-border" />

      <h2 className="font-serif text-2xl mb-2">{t("profile.title", lang)}</h2>
      <p className="text-sm text-muted mb-6">{t("profile.socialHint", lang)}</p>
      <ProfileForm lang={lang} profile={profile} />
    </div>
  );
}
