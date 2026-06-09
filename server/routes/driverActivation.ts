/**
 * Driver activation API (Express, legacy/local server path).
 *
 * POST /api/driver/activate      — email an activation key (Resend)
 * POST /api/driver/validate-key  — one-time key + new PIN -> session token
 * POST /api/driver/validate-pin  — returning driver PIN -> session token
 *
 * The deployed SPA normally talks to Supabase directly (client/src/lib/
 * driverSession.ts implements the same key/PIN logic in the browser); these
 * endpoints exist for the Express deployment path. PIN hashes use the same
 * PBKDF2-SHA256 format as the client (`pbkdf2-sha256$iter$salt$hash`), so
 * either side can verify a hash the other wrote.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { sendActivationEmail, validateActivationEmailPayload } from "../driverEmail";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_BYTES = 32;
const MAX_PIN_ATTEMPTS = 5;
const PIN_WINDOW_MS = 15 * 60 * 1000;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_BYTES, "sha256");
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const [scheme, iterationsRaw, saltB64, hashB64] = storedHash.split("$");
  if (scheme !== "pbkdf2-sha256" || !iterationsRaw || !saltB64 || !hashB64) return false;
  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = pbkdf2Sync(pin, Buffer.from(saltB64, "base64"), iterations, expected.length, "sha256");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

let adminClient: SupabaseClient | null | undefined;

function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  adminClient = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  if (!adminClient) {
    console.warn("[driver-api] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing; key/PIN endpoints disabled.");
  }
  return adminClient;
}

// In-memory PIN rate limiting: 5 attempts per 15 minutes per employee.
const pinAttempts = new Map<string, { count: number; resetAt: number }>();

function pinRateLimited(employeeId: string): boolean {
  const now = Date.now();
  const entry = pinAttempts.get(employeeId);
  if (!entry || entry.resetAt < now) {
    pinAttempts.set(employeeId, { count: 1, resetAt: now + PIN_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PIN_ATTEMPTS;
}

export const driverActivationRouter = Router();

driverActivationRouter.post("/activate", async (req, res) => {
  const payload = validateActivationEmailPayload(req.body);
  if (!payload) {
    res.status(400).json({ error: "A valid email and activation key (XXXX-XXXX-XXXX) are required." });
    return;
  }
  const result = await sendActivationEmail(payload);
  if (!result.sent) {
    res.status(502).json({ error: result.error ?? "Email could not be sent." });
    return;
  }
  res.json({ sent: true });
});

driverActivationRouter.post("/validate-key", async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res.status(503).json({ error: "Driver auth backend is not configured." });
    return;
  }
  const { activationKey, pin } = (req.body ?? {}) as { activationKey?: string; pin?: string };
  if (typeof activationKey !== "string" || !/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(activationKey) || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "An activation key and 4-digit PIN are required." });
    return;
  }

  const { data: activation } = await supabase
    .from("driver_activations")
    .select("id, employee_id, employee_name, status, expires_at")
    .eq("activation_key", activationKey)
    .maybeSingle();
  if (!activation) {
    res.status(404).json({ error: "That key wasn't found." });
    return;
  }
  if (activation.status !== "pending") {
    res.status(409).json({ error: `This key is ${activation.status}.` });
    return;
  }
  if (new Date(activation.expires_at).getTime() < Date.now()) {
    await supabase.from("driver_activations").update({ status: "expired" }).eq("id", activation.id);
    res.status(410).json({ error: "This key has expired. Ask your dispatcher to resend it." });
    return;
  }

  const sessionToken = randomBytes(32).toString("base64url");
  await supabase
    .from("driver_activations")
    .update({ pin_hash: hashPin(pin), session_token: sessionToken, status: "activated", activated_at: new Date().toISOString() })
    .eq("id", activation.id);
  const { data: session, error } = await supabase
    .from("driver_sessions")
    .insert({
      id: randomUUID(),
      employee_id: activation.employee_id,
      activation_id: activation.id,
      session_token: sessionToken,
      display_name: activation.employee_name,
      is_online: false,
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !session) {
    res.status(500).json({ error: "Could not start the session." });
    return;
  }
  res.json({
    sessionToken,
    sessionId: session.id,
    employeeId: activation.employee_id,
    displayName: activation.employee_name,
  });
});

driverActivationRouter.post("/validate-pin", async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res.status(503).json({ error: "Driver auth backend is not configured." });
    return;
  }
  const { employeeId, pin } = (req.body ?? {}) as { employeeId?: string; pin?: string };
  if (typeof employeeId !== "string" || !employeeId || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "An employee id and 4-digit PIN are required." });
    return;
  }
  if (pinRateLimited(employeeId)) {
    res.status(429).json({ error: "Too many tries. Wait 15 minutes, then try again." });
    return;
  }

  const { data: activation } = await supabase
    .from("driver_activations")
    .select("id, employee_id, employee_name, pin_hash")
    .eq("employee_id", employeeId)
    .eq("status", "activated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!activation?.pin_hash || !verifyPin(pin, activation.pin_hash)) {
    res.status(401).json({ error: "Wrong PIN." });
    return;
  }

  const sessionToken = randomBytes(32).toString("base64url");
  const { data: session, error } = await supabase
    .from("driver_sessions")
    .insert({
      id: randomUUID(),
      employee_id: activation.employee_id,
      activation_id: activation.id,
      session_token: sessionToken,
      display_name: activation.employee_name,
      is_online: false,
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !session) {
    res.status(500).json({ error: "Could not start the session." });
    return;
  }
  res.json({
    sessionToken,
    sessionId: session.id,
    employeeId: activation.employee_id,
    displayName: activation.employee_name,
  });
});
