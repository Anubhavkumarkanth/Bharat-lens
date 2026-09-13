import { cookies } from "next/headers";
import { VISITOR_COOKIE, isValidVisitorId } from "./visitor-constants";

/**
 * The anonymous reader. There are no accounts — this id is minted into a cookie
 * by src/proxy.ts on the first request and is the only thing tying a person to
 * their likes, saves and preferences. No email, no password, nothing personal.
 *
 * Returns null only if the cookie is somehow absent (a route the proxy matcher
 * skipped). Callers treat that as "no stored state" rather than an error, so a
 * missing cookie degrades to an empty feed state instead of a crash.
 */
export async function getVisitorId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(VISITOR_COOKIE)?.value;
  return isValidVisitorId(value) ? value : null;
}
