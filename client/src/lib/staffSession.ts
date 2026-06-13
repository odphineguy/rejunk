/**
 * Staff-side session management for the office app ("the front door").
 *
 * Auth now runs SERVER-SIDE: the staff / staff_sessions tables are locked down
 * (RLS, migrations 202606130001/2), so the browser can't read PIN hashes or
 * create logins. login/validate/logout go through POST /api/staff
 * (lib/staffApi.ts → server/staffAccess.ts / api/staff.ts). The server verifies
 * the PIN and returns an opaque session token, stored here in localStorage.
 *
 * Staff and driver sessions are fully independent — logging in as one grants
 * nothing for the other.
 */

import { postStaff } from "@/lib/staffApi";

const SESSION_KEY = "rejunk_staff_session";
const PIN_ATTEMPTS_KEY = "rejunk_staff_pin_attempts";
export const STAFF_SESSION_EVENT = "staff-session-updated";

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;
// Office machines re-enter the PIN once a month rather than every visit.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type StaffSessionCheck = "valid" | "invalid" | "missing" | "offline";

export type StoredStaffSession = {
  staffId: string;
  fullName: string;
  email: string;
  role: string;
  token: string;
  mustChangePin?: boolean;
  expiresAt: number;
};

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

export function getStoredStaffSession(): StoredStaffSession | null {
  const stored = readJson<StoredStaffSession>(SESSION_KEY);
  if (!stored?.staffId || !stored.token || !stored.expiresAt) return null;
  if (stored.expiresAt < Date.now()) {
    clearStaffSession();
    return null;
  }
  return stored;
}

/** True when the signed-in staffer is an owner (sees everything). */
export function isOwner(session: StoredStaffSession | null = getStoredStaffSession()): boolean {
  return session?.role === "owner";
}

export function clearStaffSession() {
  const stored = readJson<StoredStaffSession>(SESSION_KEY);
  if (stored?.token) void postStaff("logout", { token: stored.token });
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(STAFF_SESSION_EVENT));
}

/**
 * Re-checks the stored session against the server. "offline" means the backend
 * couldn't be reached — callers let the user keep working rather than locking
 * the office out during an outage (same leniency as the driver gate).
 */
export async function validateStoredStaffSession(): Promise<StaffSessionCheck> {
  const stored = getStoredStaffSession();
  if (!stored) return "missing";

  const res = await postStaff<{ valid: boolean; role?: string; fullName?: string; email?: string; mustChangePin?: boolean }>(
    "validate",
    { token: stored.token }
  );
  if (res.status === 0) return "offline"; // network error — keep working
  if (!res.data.valid) {
    clearStaffSession();
    return "invalid";
  }
  // Refresh cached fields in case role/email/name changed server-side.
  writeJson(SESSION_KEY, {
    ...stored,
    role: res.data.role ?? stored.role,
    fullName: res.data.fullName ?? stored.fullName,
    email: res.data.email ?? stored.email,
    mustChangePin: res.data.mustChangePin ?? stored.mustChangePin,
  });
  window.dispatchEvent(new Event(STAFF_SESSION_EVENT));
  return "valid";
}

/** Email + PIN sign-in. Locked out for 15 minutes after 5 misses. */
export async function loginWithEmailPin(email: string, pin: string): Promise<StoredStaffSession> {
  const lockedForMs = pinLockoutRemainingMs();
  if (lockedForMs > 0) {
    throw new Error(`Too many tries. Wait ${Math.ceil(lockedForMs / 60000)} minutes, then try again.`);
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) throw new Error("Enter the email address on your staff account.");
  if (!/^\d{4}$/.test(pin)) throw new Error("Your PIN is exactly 4 digits.");

  const res = await postStaff<{
    token: string;
    staffId: string;
    fullName: string;
    email: string;
    role: string;
    mustChangePin?: boolean;
  }>("login", { email: normalizedEmail, pin });

  if (!res.ok || !res.data.token) {
    // Wrong creds count toward the local lockout too (server also rate-limits).
    if (res.status === 401) recordFailedPinAttempt();
    throw new Error(res.error || "That email and PIN don't match.");
  }

  const session: StoredStaffSession = {
    staffId: res.data.staffId,
    fullName: res.data.fullName,
    email: res.data.email,
    role: res.data.role,
    token: res.data.token,
    mustChangePin: res.data.mustChangePin,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  writeJson(SESSION_KEY, session);
  resetPinAttempts();
  window.dispatchEvent(new Event(STAFF_SESSION_EVENT));
  return session;
}

/** Updates the cached session in place (e.g. after a profile email change). */
export function patchStoredStaffSession(patch: Partial<StoredStaffSession>) {
  const stored = getStoredStaffSession();
  if (!stored) return;
  writeJson(SESSION_KEY, { ...stored, ...patch });
  window.dispatchEvent(new Event(STAFF_SESSION_EVENT));
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
