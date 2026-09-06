/**
 * Driver auth — server-side key/PIN/session handling (security audit item 2).
 *
 * Before 2026-09-06 the driver app validated activation keys and PINs IN THE
 * BROWSER against driver_activations / driver_sessions, which meant every
 * anonymous visitor could read activation keys, PIN hashes and live session
 * tokens (and overwrite them). Now:
 *   * activation keys and session tokens are stored only as SHA-256 hashes;
 *   * PIN hashes never leave the server (column-level grants hide them);
 *   * the browser can no longer insert or update driver_activations, nor insert
 *     driver_sessions — only the location/workday columns stay browser-writable;
 *   * failed PIN attempts + lockouts live on the activation row, so the limit
 *     survives serverless cold starts and can't be cleared from localStorage.
 *
 * Office actions (create-activation / revoke) require a valid STAFF session
 * token (staff_sessions, see server/staffAccess.ts). Driver actions use the
 * driver's own session token. Shared by the Express route
 * (server/routes/driverActivation.ts) and the Vite dev middleware
 * (vite.config.ts). SELF-CONTAINED COPY for Vercel: api/driver/auth.ts — keep
 * in sync (same rule as staffAccess.ts ↔ api/staff.ts).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_BYTES = 32;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;
export const ACTIVATION_EXPIRY_HOURS = 72;

// No 0/O or 1/I — drivers type these keys on a phone.
const KEY_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const KEY_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export type Result = { status: number; body: Record<string, unknown> };

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_BYTES, "sha256");
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const [scheme, iterationsRaw, saltB64, hashB64] = (storedHash ?? "").split("$");
  if (scheme !== "pbkdf2-sha256" || !iterationsRaw || !saltB64 || !hashB64) return false;
  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = pbkdf2Sync(pin, Buffer.from(saltB64, "base64"), iterations, expected.length, "sha256");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Keys/tokens are high-entropy, so a plain (unsalted) SHA-256 is enough to
 * make a leaked column useless. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function generateActivationKey(): string {
  const group = () => {
    const bytes = randomBytes(4);
    return Array.from(bytes, (b) => KEY_CHARSET[b % KEY_CHARSET.length]).join("");
  };
  return `${group()}-${group()}-${group()}`;
}

/** Uppercases and re-groups whatever the driver typed/pasted into XXXX-XXXX-XXXX. */
export function normalizeActivationKey(raw: string): string {
  const characters = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const groups = [characters.slice(0, 4), characters.slice(4, 8), characters.slice(8, 12)].filter(Boolean);
  return groups.join("-");
}

let adminClient: SupabaseClient | null | undefined;
export function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  adminClient = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  if (!adminClient) {
    console.warn("[driver-api] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing; driver auth endpoints disabled.");
  }
  return adminClient;
}

const isPin = (value: unknown): value is string => typeof value === "string" && /^\d{4}$/.test(value);
const isEmail = (value: unknown): value is string =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// ---------------------------------------------------------------- staff token

export type StaffCaller = { id: string; role: string; employeeId: string | null };

/** Resolves an office (staff) session token to an ACTIVE staff row, or null. */
export async function resolveStaffToken(supabase: SupabaseClient, token: unknown): Promise<StaffCaller | null> {
  if (typeof token !== "string" || !token) return null;
  const { data: session } = await supabase
    .from("staff_sessions")
    .select("staff_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null;
  const { data: staff } = await supabase
    .from("staff")
    .select("id, role, active, employee_id")
    .eq("id", session.staff_id)
    .maybeSingle();
  if (!staff || !staff.active) return null;
  return { id: staff.id, role: staff.role, employeeId: staff.employee_id };
}

const STAFF_REQUIRED: Result = { status: 401, body: { error: "Sign in to the office app to manage driver access." } };
const NOT_CONFIGURED: Result = { status: 503, body: { error: "Driver auth backend is not configured." } };

// ---------------------------------------------------------------- rows

type ActivationRow = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  email_sent_to: string | null;
  status: string;
  expires_at: string;
  activated_at: string | null;
  created_by: string | null;
  created_at: string;
  pin_hash: string | null;
  failed_attempts: number;
  locked_until: string | null;
};

const ACTIVATION_COLUMNS =
  "id, employee_id, employee_name, email_sent_to, status, expires_at, activated_at, created_by, created_at, pin_hash, failed_attempts, locked_until";

function publicActivation(row: ActivationRow) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name ?? undefined,
    emailSentTo: row.email_sent_to ?? undefined,
    status: row.status,
    expiresAt: row.expires_at,
    activatedAt: row.activated_at ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

async function createSession(supabase: SupabaseClient, activation: ActivationRow): Promise<Result> {
  const sessionToken = generateSessionToken();
  const { data: session, error } = await supabase
    .from("driver_sessions")
    .insert({
      id: randomUUID(),
      employee_id: activation.employee_id,
      activation_id: activation.id,
      session_token_hash: sha256(sessionToken),
      display_name: activation.employee_name,
      is_online: false,
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !session) return { status: 500, body: { error: "Could not start the session. Try again." } };
  return {
    status: 200,
    body: {
      sessionToken,
      sessionId: session.id,
      employeeId: activation.employee_id,
      displayName: activation.employee_name ?? undefined,
    },
  };
}

/** Marks every pending/activated key for the employee revoked and signs out all sessions. */
async function revokeEmployee(supabase: SupabaseClient, employeeId: string) {
  await Promise.all([
    supabase
      .from("driver_activations")
      .update({ status: "revoked" })
      .eq("employee_id", employeeId)
      .in("status", ["pending", "activated"]),
    supabase
      .from("driver_sessions")
      .update({ session_token_hash: null, is_online: false })
      .eq("employee_id", employeeId),
  ]);
}

/** Looks up a pending key; expires it on the fly if past its window. */
async function findPendingActivation(
  supabase: SupabaseClient,
  rawKey: unknown,
): Promise<{ activation: ActivationRow } | { error: Result }> {
  const activationKey = normalizeActivationKey(typeof rawKey === "string" ? rawKey : "");
  if (!KEY_PATTERN.test(activationKey)) {
    return { error: { status: 400, body: { error: "That key looks incomplete. It has 12 letters and numbers." } } };
  }
  const { data, error } = await supabase
    .from("driver_activations")
    .select(ACTIVATION_COLUMNS)
    .eq("activation_key_hash", sha256(activationKey))
    .maybeSingle();
  if (error) return { error: { status: 502, body: { error: "Can't reach the server right now. Try again." } } };
  const activation = data as ActivationRow | null;
  if (!activation) {
    return { error: { status: 404, body: { error: "That key wasn't found. Double-check the email from your dispatcher." } } };
  }
  if (activation.status === "revoked") {
    return { error: { status: 409, body: { error: "This key was canceled. Ask your dispatcher to send a new one." } } };
  }
  if (activation.status === "activated") {
    return { error: { status: 409, body: { error: "This key was already used. Try logging in with your PIN instead." } } };
  }
  if (activation.status === "expired" || new Date(activation.expires_at).getTime() < Date.now()) {
    if (activation.status !== "expired") {
      await supabase.from("driver_activations").update({ status: "expired" }).eq("id", activation.id);
    }
    return { error: { status: 410, body: { error: "This key has expired. Ask your dispatcher to send a new one." } } };
  }
  return { activation };
}

// ---------------------------------------------------------------- office actions

async function createActivation(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const caller = await resolveStaffToken(supabase, body.staffToken);
  if (!caller) return STAFF_REQUIRED;
  const employeeId = typeof body.employeeId === "string" ? body.employeeId.trim() : "";
  const employeeName = typeof body.employeeName === "string" ? body.employeeName.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!employeeId) return { status: 400, body: { error: "An employee id is required." } };
  if (!isEmail(email)) return { status: 400, body: { error: "This employee has no valid email on file. Add one first." } };

  // A resend invalidates everything that came before it.
  await revokeEmployee(supabase, employeeId);

  const activationKey = generateActivationKey();
  const expiresAt = new Date(Date.now() + ACTIVATION_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("driver_activations")
    .insert({
      employee_id: employeeId,
      employee_name: employeeName || null,
      activation_key_hash: sha256(activationKey),
      email_sent_to: email,
      status: "pending",
      expires_at: expiresAt,
      created_by: caller.id,
    })
    .select(ACTIVATION_COLUMNS)
    .single();
  if (error || !data) return { status: 500, body: { error: "Couldn't create the activation. Try again." } };
  // The plaintext key is returned exactly once, here — the DB only holds its hash.
  return { status: 200, body: { activation: publicActivation(data as ActivationRow), activationKey, expiresAt } };
}

async function revoke(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const caller = await resolveStaffToken(supabase, body.staffToken);
  if (!caller) return STAFF_REQUIRED;
  const employeeId = typeof body.employeeId === "string" ? body.employeeId.trim() : "";
  if (!employeeId) return { status: 400, body: { error: "An employee id is required." } };
  await revokeEmployee(supabase, employeeId);
  return { status: 200, body: { ok: true } };
}

// ---------------------------------------------------------------- driver actions

async function checkKey(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const found = await findPendingActivation(supabase, body.activationKey);
  if ("error" in found) return found.error;
  return { status: 200, body: { ok: true, employeeName: found.activation.employee_name ?? undefined } };
}

async function activate(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  if (!isPin(body.pin)) return { status: 400, body: { error: "Your PIN needs to be exactly 4 digits." } };
  const found = await findPendingActivation(supabase, body.activationKey);
  if ("error" in found) return found.error;
  const { activation } = found;
  // `.eq("status","pending")` makes a double-submit lose the race instead of re-activating.
  const { data: updated, error } = await supabase
    .from("driver_activations")
    .update({
      pin_hash: hashPin(body.pin),
      status: "activated",
      activated_at: new Date().toISOString(),
      failed_attempts: 0,
      locked_until: null,
    })
    .eq("id", activation.id)
    .eq("status", "pending")
    .select("id");
  if (error || !updated?.length) {
    return { status: 409, body: { error: "Something went wrong activating your account. Try again." } };
  }
  return createSession(supabase, activation);
}

async function login(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const employeeId = typeof body.employeeId === "string" ? body.employeeId.trim() : "";
  if (!employeeId) {
    return { status: 400, body: { error: "This phone hasn't been activated yet. Use the link in your activation email." } };
  }
  if (!isPin(body.pin)) return { status: 400, body: { error: "Your PIN is exactly 4 digits." } };

  const { data, error } = await supabase
    .from("driver_activations")
    .select(ACTIVATION_COLUMNS)
    .eq("employee_id", employeeId)
    .eq("status", "activated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { status: 502, body: { error: "Can't reach the server right now. Try again." } };
  const activation = data as ActivationRow | null;
  if (!activation?.pin_hash) {
    return { status: 404, body: { error: "Your access was reset. Ask your dispatcher to resend your activation." } };
  }

  const lockedMs = activation.locked_until ? new Date(activation.locked_until).getTime() - Date.now() : 0;
  if (lockedMs > 0) {
    return {
      status: 429,
      body: { error: `Too many tries. Wait ${Math.ceil(lockedMs / 60000)} minutes, then try again.`, lockedForMs: lockedMs },
    };
  }

  if (!verifyPin(body.pin, activation.pin_hash)) {
    const attempts = (activation.failed_attempts ?? 0) + 1;
    const lock = attempts >= MAX_PIN_ATTEMPTS;
    await supabase
      .from("driver_activations")
      .update({
        failed_attempts: lock ? 0 : attempts,
        locked_until: lock ? new Date(Date.now() + PIN_LOCKOUT_MS).toISOString() : null,
      })
      .eq("id", activation.id);
    const remaining = MAX_PIN_ATTEMPTS - attempts;
    return {
      status: lock ? 429 : 401,
      body: lock
        ? { error: "Too many tries. Locked for 15 minutes.", lockedForMs: PIN_LOCKOUT_MS }
        : { error: `Wrong PIN. ${remaining} ${remaining === 1 ? "try" : "tries"} left.`, remaining },
    };
  }

  await supabase
    .from("driver_activations")
    .update({ failed_attempts: 0, locked_until: null })
    .eq("id", activation.id);
  return createSession(supabase, activation);
}

async function resolveDriverSession(supabase: SupabaseClient, token: unknown) {
  if (typeof token !== "string" || !token) return null;
  const { data, error } = await supabase
    .from("driver_sessions")
    .select("id, employee_id, activation_id, display_name")
    .eq("session_token_hash", sha256(token))
    .maybeSingle();
  if (error) throw new Error("unreachable");
  return data as { id: string; employee_id: string; activation_id: string | null; display_name: string | null } | null;
}

async function validate(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  try {
    const session = await resolveDriverSession(supabase, body.sessionToken);
    if (!session) return { status: 200, body: { valid: false } };
    return {
      status: 200,
      body: {
        valid: true,
        sessionId: session.id,
        employeeId: session.employee_id,
        displayName: session.display_name ?? undefined,
      },
    };
  } catch {
    return { status: 502, body: { error: "Can't reach the server right now." } };
  }
}

async function logout(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  if (typeof body.sessionToken === "string" && body.sessionToken) {
    await supabase
      .from("driver_sessions")
      .update({ session_token_hash: null, is_online: false })
      .eq("session_token_hash", sha256(body.sessionToken));
  }
  return { status: 200, body: { ok: true } };
}

async function updatePin(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  if (!isPin(body.newPin)) return { status: 400, body: { error: "Your new PIN needs to be exactly 4 digits." } };
  let session: Awaited<ReturnType<typeof resolveDriverSession>>;
  try {
    session = await resolveDriverSession(supabase, body.sessionToken);
  } catch {
    return { status: 502, body: { error: "Can't reach the server right now. Try again." } };
  }
  if (!session) return { status: 401, body: { error: "Your session expired. Sign in again." } };

  const { data } = await supabase
    .from("driver_activations")
    .select(ACTIVATION_COLUMNS)
    .eq("employee_id", session.employee_id)
    .eq("status", "activated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const activation = data as ActivationRow | null;
  if (!activation?.pin_hash) {
    return { status: 404, body: { error: "Your access was reset. Ask your dispatcher to resend your activation." } };
  }
  if (!isPin(body.currentPin) || !verifyPin(body.currentPin, activation.pin_hash)) {
    return { status: 401, body: { error: "That current PIN is incorrect." } };
  }
  const { error } = await supabase
    .from("driver_activations")
    .update({ pin_hash: hashPin(body.newPin) })
    .eq("id", activation.id);
  if (error) return { status: 500, body: { error: "Something went wrong updating your PIN. Try again." } };
  return { status: 200, body: { ok: true } };
}

// ---------------------------------------------------------------- dispatcher

export async function handleDriverAction(body: unknown): Promise<Result> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NOT_CONFIGURED;
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  switch (payload.action) {
    case "create-activation":
      return createActivation(supabase, payload);
    case "revoke":
      return revoke(supabase, payload);
    case "check-key":
      return checkKey(supabase, payload);
    case "activate":
      return activate(supabase, payload);
    case "login":
      return login(supabase, payload);
    case "validate":
      return validate(supabase, payload);
    case "logout":
      return logout(supabase, payload);
    case "update-pin":
      return updatePin(supabase, payload);
    default:
      return { status: 400, body: { error: "Unknown action." } };
  }
}
