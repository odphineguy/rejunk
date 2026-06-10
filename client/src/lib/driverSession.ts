/**
 * Driver-side session management for the mobile driver app.
 *
 * Flow: manager emails an activation key -> driver enters it once and sets a
 * 4-digit PIN (`activateWithKey`) -> a driver_sessions row is created and its
 * token stored in localStorage -> later visits validate that token
 * (`validateStoredSession`) or re-auth with the PIN (`loginWithPin`).
 *
 * Drivers' phones do not have the office's localStorage employee list, so the
 * driver identity (name, employee id) rides along on the activation/session
 * rows instead of employeeStorage.
 */

import { generateSessionToken, hashPin, normalizeActivationKey, verifyPin } from "@/lib/driverAuth";
import { ensureSession, supabase } from "@/lib/supabase";
import type { StoredDriverSession } from "@/types/driver";

const SESSION_KEY = "rejunk_driver_session";
// Survives session invalidation so the PIN screen knows who is logging in.
const IDENTITY_KEY = "rejunk_driver_identity";
const PIN_ATTEMPTS_KEY = "rejunk_driver_pin_attempts";

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;

export type SessionCheck = "valid" | "invalid" | "missing" | "offline";

type DriverIdentity = { employeeId: string; displayName?: string };
type PinAttempts = { count: number; lockedUntil?: number };

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

function readJson<T>(key: string): T | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getStoredDriverSession(): StoredDriverSession | null {
  const stored = readJson<StoredDriverSession>(SESSION_KEY);
  return stored?.sessionToken && stored.employeeId ? stored : null;
}

export function storeDriverSession(session: StoredDriverSession) {
  writeJson(SESSION_KEY, session);
  writeJson<DriverIdentity>(IDENTITY_KEY, { employeeId: session.employeeId, displayName: session.displayName });
  window.dispatchEvent(new Event("driver-session-updated"));
}

export function clearDriverSession() {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("driver-session-updated"));
}

export function getDriverIdentity(): DriverIdentity | null {
  return readJson<DriverIdentity>(IDENTITY_KEY);
}

/**
 * Checks the stored token against driver_sessions. "offline" means the backend
 * could not be reached — callers should let the driver keep working from cache
 * rather than locking them out in the field.
 */
export async function validateStoredSession(): Promise<SessionCheck> {
  const stored = getStoredDriverSession();
  if (!stored) return "missing";
  if (!supabase) return "offline";
  if (!(await ensureSession())) return "offline";

  const { data, error } = await supabase
    .from("driver_sessions")
    .select("id, employee_id")
    .eq("session_token", stored.sessionToken)
    .maybeSingle();
  if (error) return "offline";
  if (!data) {
    clearDriverSession();
    return "invalid";
  }
  return "valid";
}

/**
 * Read-only key check so the activation page can catch a bad/expired key
 * before asking the driver to set a PIN. Throws the same errors as
 * `activateWithKey`; resolves with the driver's first name for the greeting.
 */
export async function checkActivationKey(rawKey: string): Promise<string | undefined> {
  if (!supabase || !(await ensureSession())) {
    throw new Error("Can't reach the server right now. Check your connection and try again.");
  }
  const activationKey = normalizeActivationKey(rawKey);
  if (activationKey.length !== 14) throw new Error("That key looks incomplete. It has 12 letters and numbers.");
  const { data: activation, error } = await supabase
    .from("driver_activations")
    .select("id, employee_name, status, expires_at")
    .eq("activation_key", activationKey)
    .maybeSingle();
  if (error) throw new Error("Can't reach the server right now. Check your connection and try again.");
  if (!activation) throw new Error("That key wasn't found. Double-check the email from your dispatcher.");
  if (activation.status === "revoked") throw new Error("This key was canceled. Ask your dispatcher to send a new one.");
  if (activation.status === "activated") throw new Error("This key was already used. Try logging in with your PIN instead.");
  if (activation.status === "expired" || new Date(activation.expires_at).getTime() < Date.now()) {
    if (activation.status !== "expired") {
      await supabase.from("driver_activations").update({ status: "expired" }).eq("id", activation.id);
    }
    throw new Error("This key has expired. Ask your dispatcher to send a new one.");
  }
  return activation.employee_name ?? undefined;
}

/** Step 1+2 of the activation flow: validate the emailed key and set the PIN. */
export async function activateWithKey(rawKey: string, pin: string): Promise<StoredDriverSession> {
  if (!supabase || !(await ensureSession())) {
    throw new Error("Can't reach the server right now. Check your connection and try again.");
  }
  const activationKey = normalizeActivationKey(rawKey);
  if (activationKey.length !== 14) throw new Error("That key looks incomplete. It has 12 letters and numbers.");
  if (!/^\d{4}$/.test(pin)) throw new Error("Your PIN needs to be exactly 4 digits.");

  const { data: activation, error } = await supabase
    .from("driver_activations")
    .select("id, employee_id, employee_name, status, expires_at")
    .eq("activation_key", activationKey)
    .maybeSingle();
  if (error) throw new Error("Can't reach the server right now. Check your connection and try again.");
  if (!activation) throw new Error("That key wasn't found. Double-check the email from your dispatcher.");
  if (activation.status === "revoked") throw new Error("This key was canceled. Ask your dispatcher to send a new one.");
  if (activation.status === "activated") throw new Error("This key was already used. Try logging in with your PIN instead.");
  if (activation.status === "expired" || new Date(activation.expires_at).getTime() < Date.now()) {
    if (activation.status !== "expired") {
      await supabase.from("driver_activations").update({ status: "expired" }).eq("id", activation.id);
    }
    throw new Error("This key has expired. Ask your dispatcher to send a new one.");
  }

  const pinHash = await hashPin(pin);
  const sessionToken = generateSessionToken();

  const { error: updateError } = await supabase
    .from("driver_activations")
    .update({
      pin_hash: pinHash,
      session_token: sessionToken,
      status: "activated",
      activated_at: new Date().toISOString(),
    })
    .eq("id", activation.id)
    .eq("status", "pending");
  if (updateError) throw new Error("Something went wrong activating your account. Try again.");

  const session = await createSessionRow(activation.employee_id, sessionToken, activation.id, activation.employee_name ?? undefined);
  storeDriverSession(session);
  resetPinAttempts();
  return session;
}

/** Returning-driver re-auth: PIN only. Locked out for 15 minutes after 5 misses. */
export async function loginWithPin(pin: string): Promise<StoredDriverSession> {
  const lockedForMs = pinLockoutRemainingMs();
  if (lockedForMs > 0) {
    throw new Error(`Too many tries. Wait ${Math.ceil(lockedForMs / 60000)} minutes, then try again.`);
  }
  const identity = getDriverIdentity();
  if (!identity) throw new Error("This phone hasn't been activated yet. Use the link in your activation email.");
  if (!supabase || !(await ensureSession())) {
    throw new Error("Can't reach the server right now. Check your connection and try again.");
  }

  const { data: activation, error } = await supabase
    .from("driver_activations")
    .select("id, employee_id, employee_name, pin_hash, status")
    .eq("employee_id", identity.employeeId)
    .eq("status", "activated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Can't reach the server right now. Check your connection and try again.");
  if (!activation?.pin_hash) {
    throw new Error("Your access was reset. Ask your dispatcher to resend your activation.");
  }

  if (!(await verifyPin(pin, activation.pin_hash))) {
    const attempts = recordFailedPinAttempt();
    const remaining = MAX_PIN_ATTEMPTS - attempts.count;
    throw new Error(
      remaining > 0
        ? `Wrong PIN. ${remaining} ${remaining === 1 ? "try" : "tries"} left.`
        : "Too many tries. Locked for 15 minutes.",
    );
  }

  const sessionToken = generateSessionToken();
  const session = await createSessionRow(activation.employee_id, sessionToken, activation.id, activation.employee_name ?? undefined);
  storeDriverSession(session);
  resetPinAttempts();
  return session;
}

/** Profile page PIN change: verify the current PIN, then store the new hash. */
export async function updateDriverPin(currentPin: string, newPin: string): Promise<void> {
  if (!/^\d{4}$/.test(newPin)) throw new Error("Your new PIN needs to be exactly 4 digits.");
  const stored = getStoredDriverSession();
  const identity = getDriverIdentity();
  const employeeId = stored?.employeeId ?? identity?.employeeId;
  if (!employeeId) throw new Error("This phone hasn't been activated yet.");
  if (!supabase || !(await ensureSession())) {
    throw new Error("Can't reach the server right now. Check your connection and try again.");
  }

  const { data: activation, error } = await supabase
    .from("driver_activations")
    .select("id, pin_hash")
    .eq("employee_id", employeeId)
    .eq("status", "activated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Can't reach the server right now. Check your connection and try again.");
  if (!activation?.pin_hash) throw new Error("Your access was reset. Ask your dispatcher to resend your activation.");
  if (!(await verifyPin(currentPin, activation.pin_hash))) throw new Error("That current PIN is incorrect.");

  const pinHash = await hashPin(newPin);
  const { error: updateError } = await supabase
    .from("driver_activations")
    .update({ pin_hash: pinHash })
    .eq("id", activation.id);
  if (updateError) throw new Error("Something went wrong updating your PIN. Try again.");
}

async function createSessionRow(
  employeeId: string,
  sessionToken: string,
  activationId: string,
  displayName?: string,
): Promise<StoredDriverSession> {
  if (!supabase) throw new Error("Can't reach the server right now.");
  const { data, error } = await supabase
    .from("driver_sessions")
    .insert({
      employee_id: employeeId,
      activation_id: activationId,
      session_token: sessionToken,
      display_name: displayName ?? null,
      is_online: false,
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Something went wrong starting your session. Try again.");
  return { sessionId: data.id, sessionToken, employeeId, displayName };
}

export function pinLockoutRemainingMs(): number {
  const attempts = readJson<PinAttempts>(PIN_ATTEMPTS_KEY);
  if (!attempts?.lockedUntil) return 0;
  return Math.max(0, attempts.lockedUntil - Date.now());
}

function recordFailedPinAttempt(): PinAttempts {
  const attempts = readJson<PinAttempts>(PIN_ATTEMPTS_KEY) ?? { count: 0 };
  const next: PinAttempts = { count: attempts.count + 1 };
  if (next.count >= MAX_PIN_ATTEMPTS) {
    next.lockedUntil = Date.now() + PIN_LOCKOUT_MS;
    next.count = 0;
  }
  writeJson(PIN_ATTEMPTS_KEY, next);
  return next.lockedUntil ? { count: MAX_PIN_ATTEMPTS, lockedUntil: next.lockedUntil } : next;
}

function resetPinAttempts() {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(PIN_ATTEMPTS_KEY);
}
