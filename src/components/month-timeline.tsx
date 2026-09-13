"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { t, type Lang } from "@/config/ui-strings";
import type { TimelineDay } from "@/lib/timeline";

const BAR_MAX_PX = 26;
const BAR_EMPTY_PX = 2;

/**
 * Scrubbable strip of the current month. Bar height is that day's volume; an
 * accent cap marks a day the detector judged a real event. Clicking pins the
 * feed to that date.
 *
 * Every day of the month is drawn, including ones with nothing in them — the
 * query only returns days that have articles, and rendering just those turned a
 * quiet month into a couple of chunky tiles floating in space with no sense of
 * where in the month they sat.
 */
export function MonthTimeline({
  days,
  lang,
  today,
  activeDay,
}: {
  days: TimelineDay[];
  lang: Lang;
  /** YYYY-MM-DD, read once per request on the server so this stays pure. */
  today: string;
  activeDay?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (days.length === 0) return null;

  const byDate = new Map(days.map((d) => [d.date, d]));
  const month = days[0].date.slice(0, 7); // YYYY-MM
  const [year, monthIndex] = month.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();

  const peak = Math.max(...days.map((d) => d.count), 1);

  function select(date: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (date === activeDay) params.delete("day");
    else params.set("day", date);
    router.push(`${pathname}?${params.toString()}`);
  }

  const headline =
    days.find((d) => d.date === activeDay)?.headline ??
    days.filter((d) => d.special).at(-1)?.headline ??
    null;

  return (
    <section
      className="mb-7 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-card"
      aria-label={t("timeline.title", lang)}
    >
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[11px] uppercase tracking-wider text-muted">
          {t("timeline.title", lang)}
        </h2>
        {activeDay && (
          <button
            type="button"
            onClick={() => select(activeDay)}
            className="text-xs text-accent hover:underline"
          >
            {t("timeline.allDays", lang)}
          </button>
        )}
      </div>

      <div className="flex items-end gap-[3px] overflow-x-auto pb-0.5 scrollbar-none">
        {Array.from({ length: daysInMonth }, (_, i) => {
          const dayNumber = i + 1;
          const date = `${month}-${String(dayNumber).padStart(2, "0")}`;
          const data = byDate.get(date);
          const count = data?.count ?? 0;
          const active = date === activeDay;
          const isToday = date === today;
          const empty = count === 0;

          // Label only the anchors — every number turns the strip into noise.
          const labelled = dayNumber === 1 || dayNumber % 5 === 0 || isToday || active;

          return (
            <button
              key={date}
              type="button"
              onClick={() => !empty && select(date)}
              disabled={empty}
              aria-pressed={active}
              aria-label={`${date}${data ? ` — ${count} ${t("timeline.stories", lang)}` : ""}`}
              title={
                data?.headline
                  ? `${date} — ${data.headline}`
                  : `${date} · ${count} ${t("timeline.stories", lang)}`
              }
              className="group shrink-0 flex flex-col items-center gap-1 w-2.5 disabled:cursor-default"
            >
              {/* Reserved space keeps every bar sitting on the same baseline. */}
              <span
                className={`h-1 w-1 rounded-full transition-colors ${
                  data?.special ? "bg-accent" : "bg-transparent"
                }`}
                aria-hidden="true"
              />
              <span
                className={`w-full rounded-full transition-all duration-200 ${
                  active
                    ? "bg-accent"
                    : empty
                      ? "bg-border"
                      : data?.special
                        ? "bg-accent/50 group-hover:bg-accent/80"
                        : "bg-border-strong group-hover:bg-muted"
                }`}
                style={{
                  height: empty ? `${BAR_EMPTY_PX}px` : `${Math.max(5, (count / peak) * BAR_MAX_PX)}px`,
                }}
                aria-hidden="true"
              />
              <span
                className={`text-[9px] leading-none tabular-nums transition-colors ${
                  active
                    ? "text-accent font-medium"
                    : isToday
                      ? "text-foreground"
                      : "text-muted/70 group-hover:text-foreground"
                } ${labelled ? "" : "opacity-0"}`}
              >
                {dayNumber}
              </span>
            </button>
          );
        })}
      </div>

      {headline && (
        <p className="mt-2.5 pt-2.5 border-t border-border text-xs text-muted line-clamp-1">
          <span className="text-accent font-medium">{t("timeline.bigDay", lang)}</span> · {headline}
        </p>
      )}
    </section>
  );
}
