import { isDatabaseUnreachable } from "@/lib/db/availability";

/**
 * The whole value of isDatabaseUnreachable is that it discriminates. If it
 * returns true too readily, genuine bugs — a typo in a column name, a bad
 * migration — get swallowed and rendered as "the database is unavailable",
 * which is the most misleading thing the app could say. These assertions pin
 * both directions.
 */
const cases: { desc: string; got: boolean; want: boolean }[] = [];

function check(desc: string, got: boolean, want: boolean) {
  cases.push({ desc, got, want });
}

/** How drizzle wraps anything postgres throws: message only, cause carries the truth. */
function drizzleWrapped(cause: unknown): Error {
  const err = new Error('Failed query: select "id" from "articles"\nparams: 1');
  (err as Error & { cause?: unknown }).cause = cause;
  return err;
}

function postgresError(code: string, message: string): Error {
  const err = new Error(message);
  err.name = "PostgresError";
  (err as Error & { code?: string }).code = code;
  return err;
}

// --- should be treated as unreachable ---

check(
  "supabase pooler reporting a paused project, wrapped by drizzle",
  isDatabaseUnreachable(
    drizzleWrapped(postgresError("XX000", "(ENOTFOUND) tenant/user postgres.abc123 not found"))
  ),
  true
);
check(
  "DNS failure",
  isDatabaseUnreachable(drizzleWrapped(postgresError("ENOTFOUND", "getaddrinfo ENOTFOUND db.host"))),
  true
);
check(
  "connection refused",
  isDatabaseUnreachable(drizzleWrapped(postgresError("ECONNREFUSED", "connect ECONNREFUSED"))),
  true
);
check(
  "postgres.js connect timeout",
  isDatabaseUnreachable(drizzleWrapped(postgresError("CONNECT_TIMEOUT", "write CONNECT_TIMEOUT"))),
  true
);
check(
  "unwrapped connection error",
  isDatabaseUnreachable(postgresError("ECONNRESET", "socket hang up")),
  true
);
check(
  "missing DATABASE_URL",
  isDatabaseUnreachable(new Error("DATABASE_URL is not set. Copy .env.example to .env.local")),
  true
);

// --- must NOT be treated as unreachable: these are bugs and must keep throwing ---

check(
  "undefined column is a bug, not an outage",
  isDatabaseUnreachable(
    drizzleWrapped(postgresError("42703", 'column "titel" does not exist'))
  ),
  false
);
check(
  "undefined table is a bug",
  isDatabaseUnreachable(
    drizzleWrapped(postgresError("42P01", 'relation "analytics.article_facts" does not exist'))
  ),
  false
);
check(
  "unique violation is a bug",
  isDatabaseUnreachable(
    drizzleWrapped(postgresError("23505", "duplicate key value violates unique constraint"))
  ),
  false
);
check(
  "a generic XX000 without a connection cause is NOT an outage",
  isDatabaseUnreachable(drizzleWrapped(postgresError("XX000", "internal error in the executor"))),
  false
);
check(
  "syntax error is a bug",
  isDatabaseUnreachable(drizzleWrapped(postgresError("42601", 'syntax error at or near "slect"'))),
  false
);
check("a plain error is not an outage", isDatabaseUnreachable(new Error("boom")), false);
check("null is not an outage", isDatabaseUnreachable(null), false);
check("a string is not an outage", isDatabaseUnreachable("ENOTFOUND"), false);

// --- report ---

let passed = 0;
for (const c of cases) {
  const ok = c.got === c.want;
  if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.desc}`);
  if (!ok) console.log(`      got=${c.got} want=${c.want}`);
}

console.log(`\n${passed}/${cases.length} passed`);
process.exit(passed === cases.length ? 0 : 1);
