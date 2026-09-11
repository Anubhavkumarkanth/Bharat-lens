"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/config/taxonomy";
import { t, type Lang, type UiStringKey } from "@/config/ui-strings";
import type { RangeOption, SortOption } from "@/lib/query";

const SORTS: SortOption[] = ["newest", "trending", "popular", "oldest"];
const RANGES: RangeOption[] = ["live", "1d", "week", "month", "past-month", "year"];

/**
 * `sort` and `range` are the values the server actually queried with — a signed-in
 * reader's saved defaults, not the URL's. Reading them from searchParams alone
 * would show "Newest" in the dropdown while the feed below was ordered otherwise.
 */
export function FilterBar({
  lang,
  sort,
  range,
}: {
  lang: Lang;
  sort: SortOption;
  range: RangeOption;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeCategory = searchParams.get("category") ?? "";
  const activeSort = (searchParams.get("sort") as SortOption) || sort;
  const activeRange = (searchParams.get("range") as RangeOption) || range;

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 mb-7">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
        <button
          onClick={() => updateParam("category", "")}
          aria-pressed={activeCategory === ""}
          className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm border transition-all duration-200 ${
            activeCategory === ""
              ? "bg-accent text-white border-accent shadow-card"
              : "border-border text-muted hover:text-foreground hover:border-border-strong"
          }`}
        >
          {t("category.all", lang)}
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => updateParam("category", c.id)}
            aria-pressed={activeCategory === c.id}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm border transition-all duration-200 ${
              activeCategory === c.id
                ? "bg-accent text-white border-accent shadow-card"
                : "border-border text-muted hover:text-foreground hover:border-border-strong"
            }`}
          >
            {t(`category.${c.id}` as UiStringKey, lang)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <select
          value={activeSort}
          onChange={(e) => updateParam("sort", e.target.value)}
          className="border border-border rounded-lg bg-surface px-2.5 py-1.5 hover:border-border-strong transition-colors"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`sort.${s}` as UiStringKey, lang)}
            </option>
          ))}
        </select>

        <select
          value={activeRange}
          onChange={(e) => updateParam("range", e.target.value)}
          className="border border-border rounded-lg bg-surface px-2.5 py-1.5 hover:border-border-strong transition-colors"
        >
          {RANGES.map((r) => (
            <option key={r} value={r}>
              {t(`range.${r}` as UiStringKey, lang)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
