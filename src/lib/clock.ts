/**
 * Clock reads for server-rendered pages.
 *
 * These pages are `force-dynamic` and render once per request, so reading the
 * time is correct — but react-hooks/purity rightly forbids calling `Date.now()`
 * inside a component body, since it can't tell a once-per-request server render
 * from a client component that re-renders. Keeping the reads here makes the
 * request-scoped intent explicit: call once at the top of a page, then pass the
 * value down so every child agrees on "now".
 */
export function requestNow(): number {
  return Date.now();
}

/** First instant of the current month in UTC — the month timeline's window. */
export function currentMonthStartUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Today as YYYY-MM-DD in UTC — the format the timeline files days under. */
export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}
