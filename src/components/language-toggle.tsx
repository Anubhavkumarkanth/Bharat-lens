"use client";

import { useRouter } from "next/navigation";
import { LANG_COOKIE } from "@/lib/lang-constants";
import type { Lang } from "@/config/ui-strings";

export function LanguageToggle({ lang }: { lang: Lang }) {
  const router = useRouter();

  function setLang(next: Lang) {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <div className="flex items-center rounded-full border border-border bg-surface text-sm overflow-hidden">
      <button
        onClick={() => setLang("en")}
        className={`px-3 py-1 cursor-pointer ${lang === "en" ? "bg-accent text-white" : "text-muted"}`}
      >
        EN
      </button>
      <button
        onClick={() => setLang("hi")}
        className={`px-3 py-1 cursor-pointer ${lang === "hi" ? "bg-accent text-white" : "text-muted"}`}
      >
        हिं
      </button>
    </div>
  );
}
