import { NextResponse, type NextRequest } from "next/server";
import { VISITOR_COOKIE, isValidVisitorId } from "@/lib/visitor-constants";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Mints the anonymous visitor cookie. This runs before any route renders
 * because Server Components can read cookies but cannot set them — without it,
 * a first-time reader would have no id until their first write, and their very
 * first like would land nowhere.
 *
 * Setting it on `request` as well as `response` is what makes it readable by
 * the page being rendered *on this same request*, not just the next one.
 *
 * `middleware` was renamed to `proxy` in Next 16 — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 */
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(VISITOR_COOKIE)?.value;
  const needsId = !isValidVisitorId(existing);
  const visitorId = needsId ? crypto.randomUUID() : existing;

  if (needsId) request.cookies.set(VISITOR_COOKIE, visitorId);

  const response = NextResponse.next({ request });

  if (needsId) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true, // nothing client-side reads it
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  }

  return response;
}

export const config = {
  // Skip static assets and image optimization — minting a cookie for every CSS
  // and JS request would put this on the hot path for no benefit.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
