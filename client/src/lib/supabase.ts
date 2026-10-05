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
  /** Office tokens minted since Phase 1b belong to one real auth account. */
  account?: string;
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
      ? { staff_token: stored.token, account: stored.authUserId || undefined }
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
    // A real office account is never replaced by an anonymous stand-in; only
    // drivers and legacy (pre-Phase 1b) office logins use anonymous sessions.
    const session =
      existing.data.session ??
      (credential.account
        ? null
        : (await supabase.auth.signInAnonymously()).data.session);
    if (!session) return false;
    if (credential.account && session.user.id !== credential.account) return false;
    if (boundCredential === key && boundUser === session.user.id) return true;
    const { account: _account, ...rpcArgs } = credential;
    const { data, error } = await supabase.rpc(
      "bind_business_identity",
      rpcArgs
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
 * underlying opaque token, so captured transport JWTs lose access immediately.
 * A real office account stays signed in on this device unless `forgetDevice`
 * is set, so next time only the PIN is needed — without a PIN-minted token
 * bound to it, that account alone can't read any business data. */
export async function clearDatabaseIdentity(
  options: { forgetDevice?: boolean } = {}
): Promise<void> {
  boundCredential = "";
  boundUser = "";
  if (!supabase) return;
  if (pending) await pending.catch(() => false);
  await supabase.rpc("bind_business_identity", {});
  const { data } = await supabase.auth.getSession();
  if (options.forgetDevice || !data.session || data.session.user.is_anonymous) {
    await supabase.auth.signOut({ scope: "local" });
  }
}

/** The real (non-anonymous) office account signed in on this device, if any. */
export async function getOfficeAccount(): Promise<{
  id: string;
  email: string;
  accessToken: string;
} | null> {
  if (!supabase || isDriverDatabaseContext()) return null;
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session || session.user.is_anonymous || !session.user.email) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    accessToken: session.access_token,
  };
}

/** Redeems the emailed sign-in code; the staffer's real account becomes this
 * device's database session (replacing any anonymous stand-in). */
export async function verifyEmailCode(email: string, code: string): Promise<boolean> {
  if (!supabase) return false;
  boundCredential = "";
  boundUser = "";
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  return !error && Boolean(data.session) && !data.session?.user.is_anonymous;
}
