export const VISITOR_COOKIE = "bl_visitor";

/**
 * The cookie is client-supplied, so its value is never trusted as-is: it is the
 * key every per-visitor row is filed under, and an arbitrary string would let a
 * visitor write unbounded garbage into a primary key. Anything that isn't a
 * plain UUID is discarded and replaced.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidVisitorId(value: string | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}
