"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isAuthConfigured } from "./config";

/** Browser-side client, used only to observe auth state changes. Null when unconfigured. */
export function createClient(): SupabaseClient | null {
  if (!isAuthConfigured()) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
