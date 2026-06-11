/**
 * Staff-side session management for the office app ("the front door").
 *
 * Mirrors `lib/driverSession.ts`: sign in with email + 4-digit PIN, the PIN is
 * verified in the browser against the `staff` table's PBKDF2 hash, and the
 * resulting session lives in localStorage. Staff and driver sessions are fully
 * independent — logging in as one grants nothing for the other.
 *
 * Unlike drivers there is no activation-key step and no server-side session
 * row: the stored session carries its own expiry, and validation re-checks
 * that the staff row still exists and is active (so deactivating someone in
 * the DB locks them out within one page load).
 */

import { verifyPin } from "@/lib/staffAuth";
import { ensureSession, supabase } from "@/lib/supabase";

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
  if (!stored?.staffId || !stored.expiresAt) return null;
  if (stored.expiresAt < Date.now()) {
    clearStaffSession();
    return null;
  }
  return stored;
}

export function clearStaffSession() {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(STAFF_SESSION_EVENT));
}

/**
 * Checks the stored session against the `staff` table. "offline" means the
 * backend could not be reached — callers should let the user keep working
 * rather than locking the office out during an outage (same leniency as the
 * driver gate).
 */
export async function validateStoredStaffSession(): Promise<StaffSessionCheck> {
  const stored = getStoredStaffSession();
  if (!stored) return "missing";
  if (!supabase) return "offline";
  if (!(await ensureSession())) return "offline";

  const { data, error } = await supabase
    .from("staff")
    .select("id, active")
    .eq("id", stored.staffId)
    .maybeSingle();
  if (error) return "offline";
  if (!data || !data.active) {
    clearStaffSession();
    return "invalid";
  }
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
  if (!supabase || !(await ensureSession())) {
    throw new Error("Can't reach the server right now. Check your connection and try again.");
  }

  const { data: staff, error } = await supabase
    .from("staff")
    .select("id, full_name, email, pin_hash, role, active")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (error) throw new Error("Can't reach the server right now. Check your connection and try again.");

  // Same generic message for unknown email and wrong PIN, and both count
  // toward the lockout, so the login page can't be used to probe for emails.
  if (!staff || !staff.active || !(await verifyPin(pin, staff.pin_hash))) {
    const attempts = recordFailedPinAttempt();
    const remaining = MAX_PIN_ATTEMPTS - attempts.count;
    throw new Error(
      remaining > 0 && !attempts.lockedUntil
        ? `That email and PIN don't match. ${remaining} ${remaining === 1 ? "try" : "tries"} left.`
        : "Too many tries. Locked for 15 minutes.",
    );
  }

  const session: StoredStaffSession = {
    staffId: staff.id,
    fullName: staff.full_name,
    email: staff.email,
    role: staff.role,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  writeJson(SESSION_KEY, session);
  resetPinAttempts();
  window.dispatchEvent(new Event(STAFF_SESSION_EVENT));
  return session;
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
