import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { isAuthConfigured } from "@/lib/supabase/config";
import { getLang } from "@/lib/lang";
import { t } from "@/config/ui-strings";

export const dynamic = "force-dynamic";

export default async function SignInPage(props: PageProps<"/signin">) {
  const lang = await getLang();

  if (!isAuthConfigured()) {
    return <p className="text-center py-24 text-muted">{t("auth.unavailable", lang)}</p>;
  }

  if (await getCurrentUser()) redirect("/for-you");

  const searchParams = await props.searchParams;
  const mode = searchParams.mode === "signup" ? "signup" : "signin";

  return (
    <div className="max-w-sm mx-auto py-12">
      <h1 className="font-serif text-2xl mb-6">
        {t(mode === "signup" ? "auth.signUp" : "auth.signIn", lang)}
      </h1>
      <AuthForm lang={lang} mode={mode} />
    </div>
  );
}
