import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;
export const isDriverDatabaseContext = () =>
  typeof window !== "undefined" &&
  /^\/driver(?:\/|$)/.test(window.location.pathname);

/** Separate transport identities keep office and driver tabs from sharing privileges. */
export const supabase: SupabaseClient<Database> | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: isDriverDatabaseContext()
            ? "rejunk-db-driver-v2"
            : "rejunk-db-office-v2",
        },
      })
    : null;
export const isSupabaseConfigured = supabase !== null;

function loginCredential(): {
  staff_token?: string;
  driver_token?: string;
} | null {
  try {
    const driver = isDriverDatabaseContext();
    const raw = localStorage.getItem(
      driver ? "rejunk_driver_session" : "rejunk_staff_session"
    );
    const stored = raw ? JSON.parse(raw) : null;
    if (driver)
      return stored?.sessionToken
        ? { driver_token: stored.sessionToken }
        : null;
    return stored?.token && stored.expiresAt > Date.now()
      ? { staff_token: stored.token }
      : null;
  } catch {
    return null;
  }
}

let pending: Promise<boolean> | null = null;
let boundCredential = "";
let boundUser = "";

/** An anonymous transport JWT alone grants NO business-data access. The database
 * verifies the opaque office/driver token and checks revocation on every query,
 * including Realtime. Client roles and employee ids are never authorization. */
export async function ensureSession(): Promise<boolean> {
  if (!supabase) return false;
  const credential = loginCredential();
  if (!credential) return false;
  const key = JSON.stringify(credential);
  if (pending) {
    await pending;
    return ensureSession();
  }
  pending = (async () => {
    const existing = await supabase.auth.getSession();
    const session =
      existing.data.session ??
      (await supabase.auth.signInAnonymously()).data.session;
    if (!session) return false;
    if (boundCredential === key && boundUser === session.user.id) return true;
    const { data, error } = await supabase.rpc(
      "bind_business_identity",
      credential
    );
    if (error || data !== true) {
      boundCredential = "";
      boundUser = "";
      return false;
    }
    // Login may have changed while the request was in flight.
    if (JSON.stringify(loginCredential()) !== key) return false;
    boundCredential = key;
    boundUser = session.user.id;
    return true;
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}

/** Drop the database binding before signing out. The auth API also revokes the
 * underlying opaque token, so captured transport JWTs lose access immediately. */
export async function clearDatabaseIdentity(): Promise<void> {
  boundCredential = "";
  boundUser = "";
  if (!supabase) return;
  if (pending) await pending.catch(() => false);
  await supabase.rpc("bind_business_identity", {});
  await supabase.auth.signOut({ scope: "local" });
}
