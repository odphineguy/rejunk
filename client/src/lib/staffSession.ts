import { clearFinancialCaches } from "@/lib/financialCache";
/**
 * Staff-side session management for the office app ("the front door").
 *
 * Auth now runs SERVER-SIDE: the staff / staff_sessions tables are locked down
 * (RLS, migrations 202606130001/2), so the browser can't read PIN hashes or
 * create logins. login/validate/logout go through POST /api/staff
 * (lib/staffApi.ts → server/staffAccess.ts / api/staff.ts). The server verifies
 * the PIN and returns an opaque session token, stored here in localStorage.
 *
 * Since MCP Phase 1b every office person also has a REAL Supabase account. A new
 * device proves the email first (requestEmailCode → confirmEmailCode, a 6-digit
 * emailed code); after that the device stays signed in to that account and only
 * the PIN (loginWithPin) is asked for. The PIN token is tied to the account.
 *
 * Staff and driver sessions are fully independent — logging in as one grants
 * nothing for the other.
 */

import {
  clearDatabaseIdentity,
  getOfficeAccount,
  verifyEmailCode,
} from "@/lib/supabase";
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
  /** Real auth account the token belongs to; absent on pre-Phase 1b logins. */
  authUserId?: string;
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

/** Signs out of the office app. `forgetDevice` also signs the email account out
 * of this device, so the next sign-in needs a fresh email code. */
export function clearStaffSession(options: { forgetDevice?: boolean } = {}) {
  clearFinancialCaches();
  void clearDatabaseIdentity(options);
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

  // A token minted for a real account is useless once that account is signed
  // out of this device (or another one signed in) — ask for the sign-in again.
  if (stored.authUserId && (await getOfficeAccount())?.id !== stored.authUserId) {
    clearStaffSession();
    return "invalid";
  }

  const res = await postStaff<{ valid: boolean; role?: string; fullName?: string; email?: string; mustChangePin?: boolean }>(
    "validate",
    { token: stored.token }
  );
  if (res.status === 0) return "offline"; // network error — keep working
  if (!res.data.valid) {
    clearStaffSession();
    return "invalid";
  }
  if(res.data.role && res.data.role !== stored.role) clearFinancialCaches();
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

/** Thrown when the PIN step needs a confirmed email account on this device first. */
export class EmailRequiredError extends Error {}

/** New-device step 1: emails a sign-in code (the server answers the same for unknown emails). */
export async function requestEmailCode(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) throw new Error("Enter the email address on your staff account.");
  const res = await postStaff("send-code", { email: normalizedEmail });
  if (!res.ok) throw new Error(res.error || "We couldn't send a code. Try again.");
}

/** New-device step 2: the emailed code signs this device in to the real account. */
export async function confirmEmailCode(email: string, code: string): Promise<void> {
  if (!/^\d{6,8}$/.test(code)) throw new Error("Enter the code from the email.");
  const ok = await verifyEmailCode(email.trim().toLowerCase(), code);
  if (!ok) throw new Error("That code didn't work. Check the newest email, or send a new code.");
}

/** PIN step. Locked out for 15 minutes after 5 misses. */
export async function loginWithPin(pin: string): Promise<StoredStaffSession> {
  const lockedForMs = pinLockoutRemainingMs();
  if (lockedForMs > 0) {
    throw new Error(`Too many tries. Wait ${Math.ceil(lockedForMs / 60000)} minutes, then try again.`);
  }
  if (!/^\d{4}$/.test(pin)) throw new Error("Your PIN is exactly 4 digits.");
  const account = await getOfficeAccount();
  if (!account) throw new EmailRequiredError("Confirm your email first.");

  const res = await postStaff<{
    token: string;
    staffId: string;
    fullName: string;
    email: string;
    role: string;
    mustChangePin?: boolean;
    authUserId?: string;
    emailRequired?: boolean;
  }>("login", { pin, accessToken: account.accessToken });

  if (!res.ok || !res.data.token) {
    if (res.data.emailRequired) throw new EmailRequiredError(res.error || "Confirm your email first.");
    // The server owns the real lockout (counted on the staff row, survives
    // reloads and other devices). Mirror it locally so the login page can show
    // a countdown; wrong creds also tick the local counter as a fallback.
    const lockedForMs = (res.data as { lockedForMs?: number }).lockedForMs;
    if (res.status === 429 && typeof lockedForMs === "number" && lockedForMs > 0) {
      writeJson<PinAttempts>(PIN_ATTEMPTS_KEY, { count: 0, lockedUntil: Date.now() + lockedForMs });
    } else if (res.status === 401) {
      recordFailedPinAttempt();
    }
    throw new Error(res.error || "That PIN doesn't match.");
  }

  const session: StoredStaffSession = {
    staffId: res.data.staffId,
    fullName: res.data.fullName,
    email: res.data.email,
    role: res.data.role,
    token: res.data.token,
    mustChangePin: res.data.mustChangePin,
    authUserId: res.data.authUserId ?? account.id,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  clearFinancialCaches();
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
