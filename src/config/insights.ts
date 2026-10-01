// Settings for /insights (used by src/lib/insights.ts).

// Window options in days. First one is the default.
export const INSIGHT_WINDOWS = [30, 7, 90] as const;
export type InsightWindow = (typeof INSIGHT_WINDOWS)[number];

// Don't show a per-source rate with fewer stories than this behind it.
// 2 out of 3 = 67% isn't a real number.
export const MIN_SAMPLE = 10;

// How many sources (by volume) to show in the category heatmap.
export const HEATMAP_SOURCES = 12;

// Rows in the overlap table.
export const OVERLAP_PAIRS = 10;

// Timezone for the hour-of-day heatmap.
export const RHYTHM_TIMEZONE = "Asia/Kolkata";

// Days since the last article before a source counts as quiet / silent.
// Silent doesn't mean broken, PTI has gone quiet for weeks and come back.
export const QUIET_AFTER_DAYS = 2;
export const SILENT_AFTER_DAYS = 7;

// Up to this many days the scope chart uses daily bars, after that weekly.
export const DAILY_BUCKETS_UP_TO = 30;
