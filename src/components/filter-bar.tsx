"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/config/taxonomy";
import { t, type Lang, type UiStringKey } from "@/config/ui-strings";
import type { RangeOption, SortOption } from "@/lib/query";

const SORTS: SortOption[] = ["newest", "trending", "popular", "oldest"];
const RANGES: RangeOption[] = ["live", "1d", "week", "month", "past-month", "year"];

export function FilterBar({ lang }: { lang: Lang }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeCategory = searchParams.get("category") ?? "";
  const activeSort = (searchParams.get("sort") as SortOption) || "newest";
  const activeRange = (searchParams.get("range") as RangeOption) || "1d";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 mb-6">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => updateParam("category", "")}
          className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm border ${
            activeCategory === "" ? "bg-accent text-white border-accent" : "border-border text-muted hover:text-foreground"
          }`}
        >
          {t("category.all", lang)}
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => updateParam("category", c.id)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm border ${
              activeCategory === c.id ? "bg-accent text-white border-accent" : "border-border text-muted hover:text-foreground"
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
          className="border border-border rounded-md bg-surface px-2 py-1"
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
          className="border border-border rounded-md bg-surface px-2 py-1"
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
