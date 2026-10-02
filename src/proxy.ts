import { NextResponse, type NextRequest } from "next/server";
import { VISITOR_COOKIE, isValidVisitorId } from "@/lib/visitor-constants";
import { LANG_COOKIE } from "@/lib/lang-constants";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Sets the anonymous visitor cookie before the page renders (Server Components
// can't set cookies). It's set on the request too so this same render can read it.
// This is Next 16's renamed middleware.
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(VISITOR_COOKIE)?.value;
  const needsId = !isValidVisitorId(existing);
  const visitorId = needsId ? crypto.randomUUID() : existing;

  if (needsId) request.cookies.set(VISITOR_COOKIE, visitorId);

  const response = NextResponse.next({ request });

  // ?lang=hi sets the language cookie, so Hindi links work for new visitors.
  // Has to happen here because layouts don't get searchParams.
  const requested = request.nextUrl.searchParams.get("lang");
  if (requested === "hi" || requested === "en") {
    request.cookies.set(LANG_COOKIE, requested);
    response.cookies.set(LANG_COOKIE, requested, {
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  }

  if (needsId) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  }

  return response;
}

export const config = {
  // skip static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
