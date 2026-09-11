/**
 * Auth is additive, exactly like AI: with no Supabase keys configured the app
 * still builds, serves every scope, and simply never shows a signed-in state.
 * Nothing on the reading path may call into Supabase without checking this.
 *
 * These must be referenced as full literals — Next inlines `process.env.NEXT_PUBLIC_*`
 * textually at build time, so a computed key would come back undefined in the browser.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isAuthConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}
