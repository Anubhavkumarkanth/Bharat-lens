import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isAuthConfigured } from "@/lib/supabase/config";

/**
 * Refreshes the Supabase session before any route renders. Server Components
 * can't write cookies, so without this a refreshed token would be computed and
 * then thrown away, logging readers out roughly every hour.
 *
 * `middleware` was renamed to `proxy` in Next 16 — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  if (!isAuthConfigured()) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Responses carrying a refreshed token must never be cached by a CDN,
        // or one reader's session would be served to another.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Must be awaited here: a refresh that lands after the response is committed
  // can't write its cookies and would force a refresh on every request.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip static assets and image optimization; auth cookies are irrelevant there
  // and matching them would put this on the hot path for every CSS and JS file.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
