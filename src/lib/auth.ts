import { createClient } from "@/lib/supabase/server";

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * The signed-in user, or null when nobody is signed in *or* auth isn't
 * configured. Uses `getUser()`, which validates the token against Supabase —
 * `getSession()` trusts whatever is in the cookie and must not gate access.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email ?? null };
}

/** Same, but throws for callers that have already established the route requires a user. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}
