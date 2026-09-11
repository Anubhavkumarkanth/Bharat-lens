"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang";
import { t } from "@/config/ui-strings";

export interface AuthFormState {
  error?: string;
  notice?: string;
}

const Credentials = z.object({
  email: z.email(),
  password: z.string().min(8),
});

/**
 * Email + password rather than magic link: Supabase's built-in mailer is rate
 * limited to a couple of messages an hour and is documented as development-only,
 * so a link-based flow would break for real visitors unless custom SMTP is paid
 * for. Supabase hashes and stores the password; it never reaches our code or DB.
 */
function parse(formData: FormData) {
  return Credentials.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const lang = await getLang();
  const supabase = await createClient();
  if (!supabase) return { error: t("auth.unavailable", lang) };

  const parsed = parse(formData);
  if (!parsed.success) {
    const badEmail = parsed.error.issues.some((i) => i.path[0] === "email");
    return { error: t(badEmail ? "auth.invalidEmail" : "auth.passwordTooShort", lang) };
  }

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: t("auth.failed", lang) };

  revalidatePath("/", "layout");
  redirect("/for-you");
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const lang = await getLang();
  const supabase = await createClient();
  if (!supabase) return { error: t("auth.unavailable", lang) };

  const parsed = parse(formData);
  if (!parsed.success) {
    const badEmail = parsed.error.issues.some((i) => i.path[0] === "email");
    return { error: t(badEmail ? "auth.invalidEmail" : "auth.passwordTooShort", lang) };
  }

  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) return { error: error.message || t("auth.signUpFailed", lang) };

  // No session means the project has email confirmation switched on, so the
  // account exists but can't be used until the link is clicked.
  if (!data.session) return { notice: t("auth.confirmEmail", lang) };

  revalidatePath("/", "layout");
  redirect("/for-you");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/india");
}
