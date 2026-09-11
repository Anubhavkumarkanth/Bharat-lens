import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isAuthConfigured } from "./config";

/**
 * Per-request Supabase client. Never cache or share it across requests — it
 * carries that request's cookies, and reusing one would leak a session.
 *
 * Returns null when auth isn't configured so callers degrade to signed-out.
 */
export async function createClient(): Promise<SupabaseClient | null> {
  if (!isAuthConfigured()) return null;

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't write cookies. Token refresh is handled by
          // src/proxy.ts, which runs before rendering and can set them.
        }
      },
    },
  });
}
