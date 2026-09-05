/**
 * Office ("staff") access — server-side auth and provisioning.
 *
 * The browser CANNOT touch the staff / staff_sessions tables (RLS locked them
 * down in 202606130001 / 202606130002). Everything goes through here, running
 * with the Supabase service-role key. Shared by the Express route
 * (server/routes/staffAccess.ts) and the Vite dev middleware (vite.config.ts).
 *
 * SELF-CONTAINED COPY for the static Vercel deployment lives in api/staff.ts —
 * Vercel can't import across api/ boundaries at runtime — so any logic change
 * here MUST be mirrored there (same rule as server/driverEmail.ts ↔
 * api/driver/activate.ts).
 *
 * Auth model: login verifies a 4-digit PIN (PBKDF2-SHA256, same scheme as
 * drivers) and hands back an opaque session token stored in staff_sessions.
 * Privileged actions (grant/revoke/list office access) require a token that
 * resolves to an ACTIVE OWNER — so the API can't be used to self-provision.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pbkdf2Sync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_BYTES = 32;
const MAX_PIN_ATTEMPTS = 5;
const PIN_WINDOW_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_FROM = "Rejunk Dispatch <onboarding@resend.dev>";
const DEFAULT_BASE_URL = "https://rejunk.vercel.app";

const OFFICE_ROLES = ["owner", "office"] as const;
type OfficeRole = (typeof OFFICE_ROLES)[number];

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

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function generateTempPin(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

let adminClient: SupabaseClient | null | undefined;
function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  adminClient = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  if (!adminClient) {
    console.warn("[staff-api] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing; staff endpoints disabled.");
  }
  return adminClient;
}

// In-memory login rate limiting: 5 attempts / 15 min per email.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function loginRateLimited(email: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(email);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(email, { count: 1, resetAt: now + PIN_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PIN_ATTEMPTS;
}

type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
  must_change_pin: boolean;
  pin_hash: string;
  employee_id: string | null;
};

type Result = { status: number; body: Record<string, unknown> };

const isEmail = (value: unknown): value is string =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isPin = (value: unknown): value is string => typeof value === "string" && /^\d{4}$/.test(value);

/** Resolves a session token to its staff row, or null if invalid/expired/inactive. */
async function resolveToken(supabase: SupabaseClient, token: unknown): Promise<StaffRow | null> {
  if (typeof token !== "string" || !token) return null;
  const { data: session } = await supabase
    .from("staff_sessions")
    .select("staff_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null;
  const { data: staff } = await supabase
    .from("staff")
    .select("id, full_name, email, role, active, must_change_pin, pin_hash, employee_id")
    .eq("id", session.staff_id)
    .maybeSingle();
  if (!staff || !staff.active) return null;
  return staff as StaffRow;
}

function publicStaff(staff: StaffRow) {
  return {
    staffId: staff.id,
    fullName: staff.full_name,
    email: staff.email,
    role: staff.role,
    mustChangePin: staff.must_change_pin,
  };
}

async function login(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const pin = body.pin;
  if (!isEmail(email) || !isPin(pin)) {
    return { status: 400, body: { error: "Enter your email and 4-digit PIN." } };
  }
  if (loginRateLimited(email)) {
    return { status: 429, body: { error: "Too many tries. Wait 15 minutes, then try again." } };
  }
  const { data: staff } = await supabase
    .from("staff")
    .select("id, full_name, email, role, active, must_change_pin, pin_hash, employee_id")
    .eq("email", email)
    .maybeSingle();
  // Identical response for unknown email and wrong PIN — no email probing.
  if (!staff || !staff.active || !verifyPin(pin as string, staff.pin_hash)) {
    return { status: 401, body: { error: "That email and PIN don't match." } };
  }
  loginAttempts.delete(email);
  const token = generateToken();
  await supabase.from("staff_sessions").insert({
    token,
    staff_id: staff.id,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  return { status: 200, body: { token, ...publicStaff(staff as StaffRow) } };
}

async function validate(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const staff = await resolveToken(supabase, body.token);
  if (!staff) return { status: 200, body: { valid: false } };
  return { status: 200, body: { valid: true, ...publicStaff(staff) } };
}

async function logout(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  if (typeof body.token === "string" && body.token) {
    await supabase.from("staff_sessions").delete().eq("token", body.token);
  }
  return { status: 200, body: { ok: true } };
}

async function grant(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const caller = await resolveToken(supabase, body.token);
  if (!caller || caller.role !== "owner") {
    return { status: 403, body: { error: "Only an owner can grant office access." } };
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim().slice(0, 120) : "";
  const role = (typeof body.role === "string" ? body.role : "office") as OfficeRole;
  const employeeId = typeof body.employeeId === "string" ? body.employeeId : null;
  if (!isEmail(email)) return { status: 400, body: { error: "A valid email is required." } };
  if (!fullName) return { status: 400, body: { error: "A name is required." } };
  if (!OFFICE_ROLES.includes(role)) return { status: 400, body: { error: "Invalid role." } };

  const pin = generateTempPin();
  const pinHash = hashPin(pin);

  // Find the person's existing login by employee link FIRST, then by email —
  // so re-granting after an email change updates the same row (and refreshes
  // their email) instead of orphaning the old login or duplicating.
  let existing: { id: string } | null = null;
  if (employeeId) {
    const byEmployee = await supabase.from("staff").select("id").eq("employee_id", employeeId).maybeSingle();
    existing = byEmployee.data;
  }
  if (!existing) {
    const byEmail = await supabase.from("staff").select("id").eq("email", email).maybeSingle();
    existing = byEmail.data;
  }
  // Guard the unique email constraint: a different login already owns this email.
  const { data: clash } = await supabase.from("staff").select("id").eq("email", email).maybeSingle();
  if (clash && (!existing || clash.id !== existing.id)) {
    return { status: 409, body: { error: "Another office login already uses that email." } };
  }

  if (existing) {
    await supabase
      .from("staff")
      .update({ full_name: fullName, email, role, employee_id: employeeId, pin_hash: pinHash, active: true, must_change_pin: true })
      .eq("id", existing.id);
    // New temp PIN invalidates old sessions.
    await supabase.from("staff_sessions").delete().eq("staff_id", existing.id);
  } else {
    await supabase
      .from("staff")
      .insert({ full_name: fullName, email, role, employee_id: employeeId, pin_hash: pinHash, active: true, must_change_pin: true });
  }

  const sent = await sendStaffPinEmail({ email, fullName, pin, role });
  return {
    status: 200,
    body: { ok: true, email, role, pin, emailed: sent.sent, emailError: sent.error },
  };
}

async function revoke(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const caller = await resolveToken(supabase, body.token);
  if (!caller || caller.role !== "owner") {
    return { status: 403, body: { error: "Only an owner can change office access." } };
  }
  const employeeId = typeof body.employeeId === "string" ? body.employeeId : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const query = supabase.from("staff").select("id").limit(1);
  const { data: target } = employeeId
    ? await query.eq("employee_id", employeeId).maybeSingle()
    : await query.eq("email", email).maybeSingle();
  if (!target) return { status: 404, body: { error: "No office login found for that person." } };
  if (target.id === caller.id) {
    return { status: 400, body: { error: "You can't remove your own office access." } };
  }
  await supabase.from("staff").update({ active: false }).eq("id", target.id);
  await supabase.from("staff_sessions").delete().eq("staff_id", target.id);
  return { status: 200, body: { ok: true } };
}

async function list(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const caller = await resolveToken(supabase, body.token);
  if (!caller || caller.role !== "owner") {
    return { status: 403, body: { error: "Only an owner can view office access." } };
  }
  const { data } = await supabase
    .from("staff")
    .select("id, employee_id, full_name, email, role, active")
    .eq("active", true);
  const access = (data ?? []).map((row) => ({
    staffId: row.id,
    employeeId: row.employee_id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
  }));
  return { status: 200, body: { access } };
}

async function contacts(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const caller = await resolveToken(supabase, body.token);
  if (!caller) return { status: 401, body: { error: "Your session expired. Sign in again." } };
  const { data, error } = await supabase
    .from("app_contact_overrides")
    .select("negotiation_id, phone, email")
    .eq("tenant_id", "progressive");
  if (error) {
    console.error("[staff-api] Contact overrides load failed.", error.message);
    return { status: 500, body: { error: "Customer contact details could not be loaded." } };
  }
  return { status: 200, body: { contacts: data ?? [] } };
}

async function updatePin(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const caller = await resolveToken(supabase, body.token);
  if (!caller) return { status: 401, body: { error: "Your session expired. Sign in again." } };
  const currentPin = body.currentPin;
  const newPin = body.newPin;
  if (!isPin(newPin)) return { status: 400, body: { error: "Your new PIN must be exactly 4 digits." } };
  // Temp-PIN accounts may skip the current-PIN check on first change.
  if (!caller.must_change_pin) {
    if (!isPin(currentPin) || !verifyPin(currentPin as string, caller.pin_hash)) {
      return { status: 401, body: { error: "Your current PIN is wrong." } };
    }
  }
  await supabase
    .from("staff")
    .update({ pin_hash: hashPin(newPin as string), must_change_pin: false })
    .eq("id", caller.id);
  return { status: 200, body: { ok: true } };
}

async function updateEmail(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const caller = await resolveToken(supabase, body.token);
  if (!caller) return { status: 401, body: { error: "Your session expired. Sign in again." } };
  const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
  if (!isEmail(newEmail)) return { status: 400, body: { error: "Enter a valid email address." } };
  const { data: clash } = await supabase.from("staff").select("id").eq("email", newEmail).maybeSingle();
  if (clash && clash.id !== caller.id) {
    return { status: 409, body: { error: "Another account already uses that email." } };
  }
  await supabase.from("staff").update({ email: newEmail }).eq("id", caller.id);
  return { status: 200, body: { ok: true, email: newEmail } };
}

/** Action dispatcher shared by the Express route and the Vite dev middleware. */
export async function handleStaffAction(body: unknown): Promise<Result> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: 503, body: { error: "Office login backend is not configured." } };
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  switch (payload.action) {
    case "login":
      return login(supabase, payload);
    case "validate":
      return validate(supabase, payload);
    case "logout":
      return logout(supabase, payload);
    case "grant":
      return grant(supabase, payload);
    case "revoke":
      return revoke(supabase, payload);
    case "list":
      return list(supabase, payload);
    case "contacts":
      return contacts(supabase, payload);
    case "update-pin":
      return updatePin(supabase, payload);
    case "update-email":
      return updateEmail(supabase, payload);
    default:
      return { status: 400, body: { error: "Unknown action." } };
  }
}

function buildStaffPinEmailHtml(opts: { fullName: string; pin: string; role: OfficeRole }) {
  const greetingName = opts.fullName.split(" ")[0] || "there";
  const roleLabel = opts.role === "owner" ? "Owner" : "Office Staff";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f3;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1c1c">
    <div style="max-width:520px;margin:0 auto;padding:24px 16px">
      <div style="background:#ffffff;border-radius:12px;border:1px solid #e2e6df;overflow:hidden">
        <img src="${DEFAULT_BASE_URL}/rejunk-email-header.png" alt="Rejunk" width="520" style="display:block;width:100%;height:auto" />
        <div style="padding:28px 24px">
          <h1 style="margin:0 0 12px;font-size:20px">Your Rejunk Office Login</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Hi ${greetingName}, you've been given <strong>${roleLabel}</strong> access to the Rejunk office app. Sign in with your email and this temporary 4-digit PIN:</p>
          <div style="background:#f0f4ec;border:1px dashed #155e3f;border-radius:10px;padding:18px;text-align:center;margin:0 0 20px">
            <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:#155e3f">${opts.pin}</span>
          </div>
          <div style="text-align:center;margin:0 0 20px">
            <a href="${DEFAULT_BASE_URL}/login" style="display:inline-block;background:#155e3f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px">Sign In</a>
          </div>
          <p style="margin:0;font-size:13px;color:#5b6357;line-height:1.5">For your security, change this PIN after you sign in (Settings → Profile). Questions? Call or text the office.</p>
        </div>
      </div>
      <p style="text-align:center;font-size:12px;color:#8a917f;margin:16px 0 0">Rejunk · Phoenix, AZ</p>
    </div>
  </body>
</html>`;
}

async function sendStaffPinEmail(opts: { email: string; fullName: string; pin: string; role: OfficeRole }): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY is not configured on the server." };
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || DEFAULT_FROM,
      to: opts.email,
      subject: "Your Rejunk Office Login",
      html: buildStaffPinEmailHtml(opts),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}
