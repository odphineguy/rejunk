/**
 * Vercel serverless twin of the Express POST /api/staff route — office login +
 * office-access management for the static Vercel deployment. Requires
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and RESEND_API_KEY in the Vercel env.
 *
 * SELF-CONTAINED ON PURPOSE: Vercel compiles api/ functions as ES modules and
 * cannot resolve imports from ../server/* at runtime. The logic below must be
 * kept in sync with server/staffAccess.ts (used by the Express route and the
 * Vite dev middleware).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pbkdf2Sync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_BYTES = 32;
const MAX_PIN_ATTEMPTS = 5;
const PIN_WINDOW_MS = 15 * 60 * 1000;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_RESEND_MS = 60 * 1000;
const DEFAULT_FROM = "Rejunk Dispatch <onboarding@resend.dev>";
const DEFAULT_BASE_URL = "https://rejunk.vercel.app";

const OFFICE_ROLES = ["owner", "office"] as const;
type OfficeRole = (typeof OFFICE_ROLES)[number];

function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_BYTES, "sha256");
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function verifyPin(pin: string, storedHash: string): boolean {
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
  return adminClient;
}

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
  failed_attempts: number;
  locked_until: string | null;
  auth_user_id: string | null;
  code_sent_at: string | null;
  tenant_id: string;
};

const STAFF_COLUMNS =
  "id, full_name, email, role, active, must_change_pin, pin_hash, employee_id, failed_attempts, locked_until, auth_user_id, code_sent_at, tenant_id";
type Result = { status: number; body: Record<string, unknown> };

const isEmail = (value: unknown): value is string =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isPin = (value: unknown): value is string => typeof value === "string" && /^\d{4}$/.test(value);

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
    .select(STAFF_COLUMNS)
    .eq("id", session.staff_id)
    .maybeSingle();
  if (!staff || !staff.active) return null;
  return staff as StaffRow;
}

/**
 * Durable PIN lockout (audit item 7): misses are counted on the staff row and
 * the account locks for 15 minutes after 5, so the limit survives serverless
 * cold starts and spans instances. The in-memory loginRateLimited() stays as a
 * backstop for emails that don't exist (nothing to count on).
 */
function lockoutResponse(staff: StaffRow): Result | null {
  const lockedMs = staff.locked_until ? new Date(staff.locked_until).getTime() - Date.now() : 0;
  if (lockedMs <= 0) return null;
  return {
    status: 429,
    body: { error: `Too many tries. Wait ${Math.ceil(lockedMs / 60000)} minutes, then try again.`, lockedForMs: lockedMs },
  };
}

async function recordPinMiss(supabase: SupabaseClient, staff: StaffRow, message: string): Promise<Result> {
  const attempts = (staff.failed_attempts ?? 0) + 1;
  const lock = attempts >= MAX_PIN_ATTEMPTS;
  await supabase
    .from("staff")
    .update({
      failed_attempts: lock ? 0 : attempts,
      locked_until: lock ? new Date(Date.now() + PIN_LOCKOUT_MS).toISOString() : null,
    })
    .eq("id", staff.id);
  if (lock) {
    return { status: 429, body: { error: "Too many tries. Locked for 15 minutes.", lockedForMs: PIN_LOCKOUT_MS } };
  }
  const remaining = MAX_PIN_ATTEMPTS - attempts;
  return { status: 401, body: { error: message, remaining } };
}

async function clearPinMisses(supabase: SupabaseClient, staffId: string) {
  await supabase.from("staff").update({ failed_attempts: 0, locked_until: null }).eq("id", staffId);
}

function publicStaff(staff: StaffRow) {
  return {
    staffId: staff.id,
    fullName: staff.full_name,
    email: staff.email,
    role: staff.role,
    mustChangePin: staff.must_change_pin,
    authUserId: staff.auth_user_id,
  };
}

/** The real (non-anonymous) Supabase user behind a browser access token, or null. */
async function realUserFromAccessToken(supabase: SupabaseClient, accessToken: unknown) {
  if (typeof accessToken !== "string" || !accessToken) return null;
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user || data.user.is_anonymous) return null;
  return data.user;
}

/**
 * Makes sure the staffer has a real Supabase Auth account with their current
 * email (created on their first sign-in code) and returns its id.
 */
async function ensureAuthUser(supabase: SupabaseClient, staff: StaffRow): Promise<string | null> {
  if (staff.auth_user_id) {
    const { data } = await supabase.auth.admin.getUserById(staff.auth_user_id);
    if (data.user) {
      if (data.user.email?.toLowerCase() !== staff.email) {
        const { error } = await supabase.auth.admin.updateUserById(staff.auth_user_id, { email: staff.email, email_confirm: true });
        if (error) return null;
      }
      return staff.auth_user_id;
    }
  }
  const created = await supabase.auth.admin.createUser({
    email: staff.email,
    email_confirm: true,
    user_metadata: { full_name: staff.full_name },
  });
  let userId = created.data.user?.id ?? null;
  if (!userId) {
    // Already registered (e.g. a half-finished earlier attempt): find it by email.
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    userId = data?.users.find((user) => user.email?.toLowerCase() === staff.email)?.id ?? null;
  }
  if (!userId) return null;
  await supabase.from("staff").update({ auth_user_id: userId }).eq("id", staff.id);
  return userId;
}

/**
 * Step 1 on a new device: email a 6-digit sign-in code. The code comes from
 * auth.admin.generateLink (Supabase never sends mail itself); the browser
 * redeems it with verifyOtp, which makes the staffer's real account the
 * session user. Same answer for unknown emails — no email probing.
 */
async function sendCode(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isEmail(email)) return { status: 400, body: { error: "Enter the email address on your staff account." } };
  if (loginRateLimited(`code:${email}`)) {
    return { status: 429, body: { error: "Too many codes requested. Wait 15 minutes, then try again." } };
  }
  const sentBody = { ok: true };
  const { data: staff } = await supabase.from("staff").select(STAFF_COLUMNS).eq("email", email).maybeSingle();
  if (!staff || !staff.active) return { status: 200, body: sentBody };
  // One code per minute per account; a quick second click just reuses the first email.
  if (staff.code_sent_at && Date.now() - new Date(staff.code_sent_at).getTime() < CODE_RESEND_MS) {
    return { status: 200, body: sentBody };
  }
  const userId = await ensureAuthUser(supabase, staff as StaffRow);
  if (!userId) return { status: 500, body: { error: "We couldn't set up your sign-in. Try again in a minute." } };
  const { data: link, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  const code = link?.properties?.email_otp;
  if (error || !code) {
    console.error("[staff-api] Sign-in code failed.", error?.message);
    return { status: 500, body: { error: "We couldn't create a sign-in code. Try again in a minute." } };
  }
  await supabase.from("staff").update({ code_sent_at: new Date().toISOString() }).eq("id", staff.id);
  const sent = await sendSignInCodeEmail({ email, fullName: staff.full_name, code });
  if (!sent.sent) {
    console.error("[staff-api] Sign-in code email failed.", sent.error);
    return { status: 500, body: { error: "We couldn't email your code. Try again in a minute." } };
  }
  return { status: 200, body: sentBody };
}

/**
 * Step 2: the PIN. Requires the real account from step 1 (its access token),
 * then mints the opaque staff token — tied to that account so it can't be
 * bound by any other database session.
 */
async function login(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const pin = body.pin;
  if (!isPin(pin)) return { status: 400, body: { error: "Your PIN is exactly 4 digits." } };
  const authUser = await realUserFromAccessToken(supabase, body.accessToken);
  if (!authUser) {
    return { status: 401, body: { error: "Confirm your email first.", emailRequired: true } };
  }
  const { data: staff } = await supabase.from("staff").select(STAFF_COLUMNS).eq("auth_user_id", authUser.id).maybeSingle();
  if (!staff || !staff.active) {
    return { status: 401, body: { error: "This email doesn't have office access.", emailRequired: true } };
  }
  if (loginRateLimited(staff.id)) {
    return { status: 429, body: { error: "Too many tries. Wait 15 minutes, then try again." } };
  }
  const locked = lockoutResponse(staff as StaffRow);
  if (locked) return locked;
  if (!verifyPin(pin as string, staff.pin_hash)) {
    return recordPinMiss(supabase, staff as StaffRow, "That PIN doesn't match.");
  }
  loginAttempts.delete(staff.id);
  await clearPinMisses(supabase, staff.id);
  const token = generateToken();
  await supabase.from("staff_sessions").insert({
    token,
    staff_id: staff.id,
    auth_user_id: authUser.id,
    // The session belongs to the signed-in person's company (no DB default).
    tenant_id: staff.tenant_id,
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
  if (!caller || caller.role !== "owner") return { status: 403, body: { error: "Only an owner can grant office access." } };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim().slice(0, 120) : "";
  const role = (typeof body.role === "string" ? body.role : "office") as OfficeRole;
  const employeeId = typeof body.employeeId === "string" ? body.employeeId : null;
  if (!isEmail(email)) return { status: 400, body: { error: "A valid email is required." } };
  if (!fullName) return { status: 400, body: { error: "A name is required." } };
  if (!OFFICE_ROLES.includes(role)) return { status: 400, body: { error: "Invalid role." } };

  const pin = generateTempPin();
  const pinHash = hashPin(pin);

  // Match the existing login by employee link first, then email, so re-granting
  // after an email change updates the same row instead of orphaning/duplicating.
  let existing: { id: string } | null = null;
  if (employeeId) {
    const byEmployee = await supabase.from("staff").select("id").eq("employee_id", employeeId).maybeSingle();
    existing = byEmployee.data;
  }
  if (!existing) {
    const byEmail = await supabase.from("staff").select("id").eq("email", email).maybeSingle();
    existing = byEmail.data;
  }
  const { data: clash } = await supabase.from("staff").select("id").eq("email", email).maybeSingle();
  if (clash && (!existing || clash.id !== existing.id)) {
    return { status: 409, body: { error: "Another office login already uses that email." } };
  }

  if (existing) {
    await supabase
      .from("staff")
      .update({ full_name: fullName, email, role, employee_id: employeeId, pin_hash: pinHash, active: true, must_change_pin: true, failed_attempts: 0, locked_until: null })
      .eq("id", existing.id);
    await supabase.from("staff_sessions").delete().eq("staff_id", existing.id);
  } else {
    await supabase
      .from("staff")
      .insert({ full_name: fullName, email, role, employee_id: employeeId, pin_hash: pinHash, active: true, must_change_pin: true, failed_attempts: 0, locked_until: null, tenant_id: caller.tenant_id });
  }
  const sent = await sendStaffPinEmail({ email, fullName, pin, role });
  return { status: 200, body: { ok: true, email, role, pin, emailed: sent.sent, emailError: sent.error } };
}

async function revoke(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const caller = await resolveToken(supabase, body.token);
  if (!caller || caller.role !== "owner") return { status: 403, body: { error: "Only an owner can change office access." } };
  const employeeId = typeof body.employeeId === "string" ? body.employeeId : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const query = supabase.from("staff").select("id").limit(1);
  const { data: target } = employeeId
    ? await query.eq("employee_id", employeeId).maybeSingle()
    : await query.eq("email", email).maybeSingle();
  if (!target) return { status: 404, body: { error: "No office login found for that person." } };
  if (target.id === caller.id) return { status: 400, body: { error: "You can't remove your own office access." } };
  await supabase.from("staff").update({ active: false }).eq("id", target.id);
  await supabase.from("staff_sessions").delete().eq("staff_id", target.id);
  return { status: 200, body: { ok: true } };
}

async function list(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const caller = await resolveToken(supabase, body.token);
  if (!caller || caller.role !== "owner") return { status: 403, body: { error: "Only an owner can view office access." } };
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
  // tenant_id is moving from the text slug to the company uuid (MCP Phase 1
  // part 2, step 2), so match either form here instead of filtering in SQL —
  // a slug filter fails against a uuid column and vice versa.
  const [{ data: company }, { data, error }] = await Promise.all([
    supabase.from("companies").select("id").eq("slug", "progressive").maybeSingle(),
    supabase.from("app_contact_overrides").select("tenant_id, negotiation_id, phone, email"),
  ]);
  if (error) {
    console.error("[staff-api] Contact overrides load failed.", error.message);
    return { status: 500, body: { error: "Customer contact details could not be loaded." } };
  }
  const tenants = new Set(["progressive", company?.id].filter(Boolean));
  const contacts = (data ?? [])
    .filter(row => tenants.has(String(row.tenant_id)))
    .map(({ negotiation_id, phone, email }) => ({ negotiation_id, phone, email }));
  return { status: 200, body: { contacts } };
}

async function updatePin(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const caller = await resolveToken(supabase, body.token);
  if (!caller) return { status: 401, body: { error: "Your session expired. Sign in again." } };
  const currentPin = body.currentPin;
  const newPin = body.newPin;
  if (!isPin(newPin)) return { status: 400, body: { error: "Your new PIN must be exactly 4 digits." } };
  if (!caller.must_change_pin) {
    const locked = lockoutResponse(caller);
    if (locked) return locked;
    if (!isPin(currentPin) || !verifyPin(currentPin as string, caller.pin_hash)) {
      return recordPinMiss(supabase, caller, "Your current PIN is wrong.");
    }
  }
  await supabase
    .from("staff")
    .update({ pin_hash: hashPin(newPin as string), must_change_pin: false, failed_attempts: 0, locked_until: null })
    .eq("id", caller.id);
  return { status: 200, body: { ok: true } };
}

async function updateEmail(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const caller = await resolveToken(supabase, body.token);
  if (!caller) return { status: 401, body: { error: "Your session expired. Sign in again." } };
  const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
  if (!isEmail(newEmail)) return { status: 400, body: { error: "Enter a valid email address." } };
  const { data: clash } = await supabase.from("staff").select("id").eq("email", newEmail).maybeSingle();
  if (clash && clash.id !== caller.id) return { status: 409, body: { error: "Another account already uses that email." } };
  if (caller.auth_user_id) {
    const { error } = await supabase.auth.admin.updateUserById(caller.auth_user_id, { email: newEmail, email_confirm: true });
    if (error) return { status: 409, body: { error: "Another account already uses that email." } };
  }
  await supabase.from("staff").update({ email: newEmail }).eq("id", caller.id);
  return { status: 200, body: { ok: true, email: newEmail } };
}

async function handleStaffAction(body: unknown): Promise<Result> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: 503, body: { error: "Office login backend is not configured." } };
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  switch (payload.action) {
    case "send-code":
      return sendCode(supabase, payload);
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

function buildSignInCodeEmailHtml(opts: { fullName: string; code: string }) {
  const greetingName = opts.fullName.split(" ")[0] || "there";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f3;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1c1c">
    <div style="max-width:520px;margin:0 auto;padding:24px 16px">
      <div style="background:#ffffff;border-radius:12px;border:1px solid #e2e6df;overflow:hidden">
        <img src="${DEFAULT_BASE_URL}/rejunk-email-header.png" alt="Rejunk" width="520" style="display:block;width:100%;height:auto" />
        <div style="padding:28px 24px">
          <h1 style="margin:0 0 12px;font-size:20px">Your Rejunk sign-in code</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Hi ${greetingName}, enter this code on the sign-in screen, then your 4-digit PIN:</p>
          <div style="background:#f0f4ec;border:1px dashed #155e3f;border-radius:10px;padding:18px;text-align:center;margin:0 0 20px">
            <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:#155e3f">${opts.code}</span>
          </div>
          <p style="margin:0;font-size:13px;color:#5b6357;line-height:1.5">The code works once and expires in an hour. You only need it the first time on each computer or phone. Didn't try to sign in? Ignore this email.</p>
        </div>
      </div>
      <p style="text-align:center;font-size:12px;color:#8a917f;margin:16px 0 0">Rejunk · Phoenix, AZ</p>
    </div>
  </body>
</html>`;
}

async function sendSignInCodeEmail(opts: { email: string; fullName: string; code: string }): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY is not configured on the server." };
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || DEFAULT_FROM,
      to: opts.email,
      subject: `Your Rejunk sign-in code: ${opts.code}`,
      html: buildSignInCodeEmailHtml(opts),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}

type VercelRequest = { method?: string; body?: unknown };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => void };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
  const { status, body: out } = await handleStaffAction(body);
  res.status(status).json(out);
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
