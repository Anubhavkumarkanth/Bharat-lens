// Time helpers for pages. The react-hooks/purity lint rule doesn't allow
// Date.now() inside components, so pages call these once and pass the value down.
export function requestNow(): number {
  return Date.now();
}

// Start of the current month (UTC).
export function currentMonthStartUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// Today as YYYY-MM-DD (UTC).
export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}
