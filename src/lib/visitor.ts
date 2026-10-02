import { cookies } from "next/headers";
import { VISITOR_COOKIE, isValidVisitorId } from "./visitor-constants";

// Visitor id from the cookie set in src/proxy.ts. Null if missing, which callers
// treat as "nothing saved".
export async function getVisitorId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(VISITOR_COOKIE)?.value;
  return isValidVisitorId(value) ? value : null;
}
