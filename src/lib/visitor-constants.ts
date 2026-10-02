export const VISITOR_COOKIE = "bl_visitor";

// The cookie comes from the browser, so anything that isn't a UUID gets replaced.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidVisitorId(value: string | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}
