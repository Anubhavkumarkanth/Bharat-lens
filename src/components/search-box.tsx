"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { t, type Lang } from "@/config/ui-strings";

/**
 * Header search. A plain form so it works before hydration and so Enter
 * submits, with the current query pre-filled when the reader is already on the
 * results page.
 */
export function SearchBox({ lang }: { lang: Lang }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const query = value.trim();
        if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
      }}
      className="relative"
    >
      <label htmlFor="site-search" className="sr-only">
        {t("search.title", lang)}
      </label>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id="site-search"
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("search.placeholder", lang)}
        className="w-36 sm:w-52 rounded-full border border-border bg-surface pl-8 pr-3 py-1.5 text-sm transition-[width,border-color] duration-200 focus:w-44 sm:focus:w-64 hover:border-border-strong"
      />
    </form>
  );
}
