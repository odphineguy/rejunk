import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Supabase client, or `null` when env vars are absent. Callers treat a null
 * client as "not configured" and fall back to local-only behavior, so the app
 * still runs (e.g. in a build without secrets) instead of crashing.
 */
export const supabase: SupabaseClient<Database> | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

export const isSupabaseConfigured = supabase !== null;

let sessionPromise: Promise<boolean> | null = null;

/**
 * Ensures there is an authenticated session before any RLS-protected query.
 * There is no login UI yet, so we use anonymous sign-in: the user silently gets
 * an `authenticated` session. When real auth is added later, an existing signed-in
 * session is reused and we never create an anonymous one.
 *
 * Resolves `true` when a session exists, `false` if auth could not be established
 * (e.g. the Anonymous provider is disabled in the Supabase dashboard).
 */
export function ensureSession(): Promise<boolean> {
  if (!supabase) return Promise.resolve(false);
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const { data: existing } = await supabase.auth.getSession();
    if (existing.session) return true;

    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error(
        "[supabase] Anonymous sign-in failed. Enable the Anonymous provider in " +
          "Authentication > Providers, or add a login flow. Falling back to local-only mode.",
        error.message,
      );
      return false;
    }
    return true;
  })();

  return sessionPromise;
}
