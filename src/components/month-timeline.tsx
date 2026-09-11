"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { t, type Lang } from "@/config/ui-strings";
import type { TimelineDay } from "@/lib/timeline";

/**
 * Scrubbable strip of the current month. Bar height is that day's volume; an
 * accent cap marks a day the detector judged a real event — several different
 * outlets on one story, not one outlet repeating itself. Clicking pins the feed
 * to that date.
 */
export function MonthTimeline({
  days,
  lang,
  activeDay,
}: {
  days: TimelineDay[];
  lang: Lang;
  activeDay?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (days.length === 0) return null;

  const peak = Math.max(...days.map((d) => d.count), 1);

  function select(date: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (date && date !== activeDay) params.set("day", date);
    else params.delete("day");
    router.push(`${pathname}?${params.toString()}`);
  }

  const headline = days.find((d) => d.date === activeDay)?.headline
    ?? days.filter((d) => d.special).at(-1)?.headline
    ?? null;

  return (
    <section className="mb-7 rounded-2xl border border-border bg-surface p-4 shadow-card" aria-label={t("timeline.title", lang)}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">{t("timeline.title", lang)}</h2>
        {activeDay && (
          <button
            type="button"
            onClick={() => select(null)}
            className="text-xs text-accent hover:underline"
          >
            {t("timeline.allDays", lang)}
          </button>
        )}
      </div>

      <div className="flex items-end gap-1 overflow-x-auto pb-1 scrollbar-none">
        {days.map((day) => {
          const active = day.date === activeDay;
          const dayNumber = Number(day.date.slice(8, 10));
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => select(day.date)}
              aria-pressed={active}
              title={
                day.headline
                  ? `${day.date} — ${day.headline}`
                  : `${day.date} · ${day.count} ${t("timeline.stories", lang)}`
              }
              className="group shrink-0 flex flex-col items-center gap-1 w-7"
            >
              {/* Dot marks a corroborated event; reserved space keeps bars aligned. */}
              <span
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  day.special ? "bg-accent" : "bg-transparent"
                }`}
                aria-hidden="true"
              />
              <span
                className={`w-full rounded-sm transition-all duration-200 ${
                  active
                    ? "bg-accent"
                    : day.special
                      ? "bg-accent/45 group-hover:bg-accent/70"
                      : "bg-border-strong group-hover:bg-muted"
                }`}
                style={{ height: `${Math.max(4, (day.count / peak) * 40)}px` }}
                aria-hidden="true"
              />
              <span
                className={`text-[10px] tabular-nums transition-colors ${
                  active ? "text-accent font-medium" : "text-muted group-hover:text-foreground"
                }`}
              >
                {dayNumber}
              </span>
            </button>
          );
        })}
      </div>

      {headline && (
        <p className="mt-3 pt-3 border-t border-border text-xs text-muted line-clamp-1">
          <span className="text-accent font-medium">{t("timeline.bigDay", lang)}</span> · {headline}
        </p>
      )}
    </section>
  );
}
