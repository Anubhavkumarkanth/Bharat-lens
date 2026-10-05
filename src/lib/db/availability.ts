/**
 * Telling "the database is unreachable" apart from "the query is wrong".
 *
 * Rule 1 says a missing AI key costs features, not the site. A missing database
 * was not held to the same standard: when the Supabase project paused after a
 * week idle, every page returned a 500 and a stack trace. A reader cannot tell
 * that from a broken app, and neither can anyone looking at the repo.
 *
 * Only connection-level failures are absorbed. A malformed query, a missing
 * column or a constraint violation still throws, because rule 3 says fail
 * loudly — swallowing those would hide real bugs behind an outage banner.
 */

/** Node socket errors and postgres.js connection-lifecycle codes. */
const UNREACHABLE_CODES = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "EPIPE",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED",
  "CONNECTION_REFUSED",
]);

export function isDatabaseUnreachable(error: unknown): boolean {
  // Drizzle wraps every failure in a DrizzleQueryError whose message is
  // "Failed query: ..." and whose `code` is undefined, keeping the real
  // PostgresError on `cause`. Checking only the outer error finds nothing,
  // which is exactly how the first version of this silently did nothing.
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (looksUnreachable(current)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function looksUnreachable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const { code, message } = error as { code?: unknown; message?: unknown };

  if (typeof code === "string" && UNREACHABLE_CODES.has(code)) return true;

  // Supabase's pooler reports a paused or deleted project as a generic
  // internal error (XX000) whose message carries the real cause, e.g.
  // "(ENOTFOUND) tenant/user postgres.<ref> not found". Matching XX000 alone
  // would swallow genuine server-side errors, so the message has to agree.
  if (code === "XX000" && typeof message === "string") {
    return /ENOTFOUND|tenant.*not found|ECONNREFUSED|ETIMEDOUT/i.test(message);
  }

  if (typeof message === "string" && /DATABASE_URL is not set/i.test(message)) return true;

  return false;
}

/**
 * Runs a read and returns null if the database cannot be reached.
 *
 * null means "could not ask", which is deliberately different from an empty
 * array meaning "asked, nothing matched" — a page that cannot tell those apart
 * would tell the reader there is no news when the truth is we could not look.
 */
export async function tryDb<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if (isDatabaseUnreachable(error)) {
      console.error("[db] unreachable:", error instanceof Error ? error.message : error);
      return null;
    }
    throw error;
  }
}
