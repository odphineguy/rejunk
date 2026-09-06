/**
 * Driver-side session management for the mobile driver app.
 *
 * Flow: manager emails an activation key -> driver enters it once and sets a
 * 4-digit PIN (`activateWithKey`) -> the SERVER creates a driver_sessions row
 * and hands back an opaque token stored in localStorage -> later visits
 * validate that token (`validateStoredSession`) or re-auth with the PIN
 * (`loginWithPin`).
 *
 * Since 2026-09-06 (security audit item 2) every key/PIN/token check runs
 * server-side through POST /api/driver/auth (server/driverAccess.ts or the
 * Vercel twin api/driver/auth.ts). The browser never sees activation keys, PIN
 * hashes, or other drivers' session tokens any more, and the 5-miss / 15-minute
 * lockout is enforced on the activation row in the database — the copy kept in
 * localStorage below is only so the login screen can show a countdown.
 *
 * Drivers' phones do not have the office's localStorage employee list, so the
 * driver identity (name, employee id) rides along on the session response.
 */

import { normalizeActivationKey } from "@/lib/driverAuth";
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

export type DriverAuthAction =
  | "create-activation"
  | "revoke"
  | "check-key"
  | "activate"
  | "login"
  | "validate"
  | "logout"
  | "update-pin";

export interface DriverApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
}

/** Thin client for the driver auth endpoint. status 0 = network failure. */
export async function postDriver<T = Record<string, unknown>>(
  action: DriverAuthAction,
  params: Record<string, unknown> = {},
): Promise<DriverApiResult<T>> {
  try {
    const res = await fetch("/api/driver/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...params }),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : data?.error || "Something went wrong." };
  } catch {
    return {
      ok: false,
      status: 0,
      data: {} as T,
      error: "Can't reach the server right now. Check your connection and try again.",
    };
  }
}

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
  const stored = readJson<StoredDriverSession>(SESSION_KEY);
  if (stored?.sessionToken) void postDriver("logout", { sessionToken: stored.sessionToken });
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("driver-session-updated"));
}

export function getDriverIdentity(): DriverIdentity | null {
  return readJson<DriverIdentity>(IDENTITY_KEY);
}

type SessionResponse = { sessionToken: string; sessionId: string; employeeId: string; displayName?: string };

function sessionFromResponse(data: SessionResponse): StoredDriverSession {
  return {
    sessionId: data.sessionId,
    sessionToken: data.sessionToken,
    employeeId: data.employeeId,
    displayName: data.displayName,
  };
}

/**
 * Checks the stored token with the server. "offline" means the backend could
 * not be reached — callers should let the driver keep working from cache
 * rather than locking them out in the field.
 */
export async function validateStoredSession(): Promise<SessionCheck> {
  const stored = getStoredDriverSession();
  if (!stored) return "missing";
  const res = await postDriver<{ valid: boolean; employeeId?: string; displayName?: string; sessionId?: string }>(
    "validate",
    { sessionToken: stored.sessionToken },
  );
  if (!res.ok) return "offline";
  if (!res.data.valid) {
    if (canUseLocalStorage()) window.localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event("driver-session-updated"));
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
  const activationKey = normalizeActivationKey(rawKey);
  if (activationKey.length !== 14) throw new Error("That key looks incomplete. It has 12 letters and numbers.");
  const res = await postDriver<{ employeeName?: string }>("check-key", { activationKey });
  if (!res.ok) throw new Error(res.error);
  return res.data.employeeName;
}

/** Step 1+2 of the activation flow: validate the emailed key and set the PIN. */
export async function activateWithKey(rawKey: string, pin: string): Promise<StoredDriverSession> {
  const activationKey = normalizeActivationKey(rawKey);
  if (activationKey.length !== 14) throw new Error("That key looks incomplete. It has 12 letters and numbers.");
  if (!/^\d{4}$/.test(pin)) throw new Error("Your PIN needs to be exactly 4 digits.");
  const res = await postDriver<SessionResponse>("activate", { activationKey, pin });
  if (!res.ok || !res.data.sessionToken) throw new Error(res.error || "Something went wrong activating your account. Try again.");
  const session = sessionFromResponse(res.data);
  storeDriverSession(session);
  resetPinAttempts();
  return session;
}

/** Returning-driver re-auth: PIN only. The server locks the account for 15 minutes after 5 misses. */
export async function loginWithPin(pin: string): Promise<StoredDriverSession> {
  const lockedForMs = pinLockoutRemainingMs();
  if (lockedForMs > 0) {
    throw new Error(`Too many tries. Wait ${Math.ceil(lockedForMs / 60000)} minutes, then try again.`);
  }
  const identity = getDriverIdentity();
  if (!identity) throw new Error("This phone hasn't been activated yet. Use the link in your activation email.");
  if (!/^\d{4}$/.test(pin)) throw new Error("Your PIN is exactly 4 digits.");

  const res = await postDriver<SessionResponse & { lockedForMs?: number; remaining?: number }>("login", {
    employeeId: identity.employeeId,
    pin,
  });
  if (!res.ok || !res.data.sessionToken) {
    // Mirror the server's verdict locally so the countdown renders without another round trip.
    if (res.status === 429) writeJson<PinAttempts>(PIN_ATTEMPTS_KEY, { count: 0, lockedUntil: Date.now() + (res.data.lockedForMs ?? PIN_LOCKOUT_MS) });
    else if (res.status === 401) writeJson<PinAttempts>(PIN_ATTEMPTS_KEY, { count: MAX_PIN_ATTEMPTS - (res.data.remaining ?? MAX_PIN_ATTEMPTS - 1) });
    throw new Error(res.error || "Wrong PIN.");
  }
  const session = sessionFromResponse(res.data);
  storeDriverSession(session);
  resetPinAttempts();
  return session;
}

/** Profile page PIN change: the server verifies the current PIN, then stores the new hash. */
export async function updateDriverPin(currentPin: string, newPin: string): Promise<void> {
  if (!/^\d{4}$/.test(newPin)) throw new Error("Your new PIN needs to be exactly 4 digits.");
  const stored = getStoredDriverSession();
  if (!stored) throw new Error("This phone hasn't been activated yet.");
  const res = await postDriver("update-pin", { sessionToken: stored.sessionToken, currentPin, newPin });
  if (!res.ok) throw new Error(res.error);
}

export function pinLockoutRemainingMs(): number {
  const attempts = readJson<PinAttempts>(PIN_ATTEMPTS_KEY);
  if (!attempts?.lockedUntil) return 0;
  return Math.max(0, attempts.lockedUntil - Date.now());
}

function resetPinAttempts() {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(PIN_ATTEMPTS_KEY);
}
