import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getCurrentUser } from "@/lib/auth";
import { isAuthConfigured } from "@/lib/supabase/config";
import { t, type Lang } from "@/config/ui-strings";

/**
 * Renders nothing at all when auth isn't configured, so a deployment with no
 * Supabase keys shows a clean reader-only header rather than a dead sign-in link.
 */
export async function AccountNav({ lang }: { lang: Lang }) {
  if (!isAuthConfigured()) return null;

  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link href="/signin" className="text-sm text-accent hover:underline">
        {t("auth.signIn", lang)}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/saved" className="text-muted hover:text-foreground">
        {t("nav.saved", lang)}
      </Link>
      <Link href="/preferences" className="text-muted hover:text-foreground">
        {t("nav.preferences", lang)}
      </Link>
      <form action={signOut}>
        <button type="submit" className="text-muted hover:text-foreground">
          {t("auth.signOut", lang)}
        </button>
      </form>
    </div>
  );
}
