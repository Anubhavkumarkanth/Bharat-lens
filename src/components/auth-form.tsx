"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, signUp, type AuthFormState } from "@/app/auth/actions";
import { t, type Lang } from "@/config/ui-strings";

export function AuthForm({ lang, mode }: { lang: Lang; mode: "signin" | "signup" }) {
  const action = mode === "signup" ? signUp : signIn;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{t("auth.email", lang)}</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="border border-border rounded-md bg-surface px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{t("auth.password", lang)}</span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className="border border-border rounded-md bg-surface px-3 py-2"
        />
        <span className="text-xs text-muted">{t("auth.passwordHint", lang)}</span>
      </label>

      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state.notice && <p className="text-sm text-accent">{state.notice}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {t(mode === "signup" ? "auth.signUp" : "auth.signIn", lang)}
      </button>

      <Link
        href={mode === "signup" ? "/signin" : "/signin?mode=signup"}
        className="text-sm text-accent hover:underline text-center"
      >
        {t(mode === "signup" ? "auth.haveAccount" : "auth.needAccount", lang)}
      </Link>
    </form>
  );
}
