/**
 * Driver API (Express, legacy/local server path).
 *
 * POST /api/driver/activate — email an activation key (Resend). Requires a
 *                             staff session token (`staffToken`).
 * POST /api/driver/auth     — action-dispatched driver auth: create-activation,
 *                             revoke (staff token), check-key, activate, login,
 *                             validate, logout, update-pin (driver token).
 *
 * All logic lives in server/driverAccess.ts (shared with the Vite dev
 * middleware). The deployed static site uses the Vercel functions
 * api/driver/activate.ts + api/driver/auth.ts instead (self-contained copies —
 * keep in sync).
 */

import { Router } from "express";
import { getSupabaseAdmin, handleDriverAction, resolveStaffToken } from "../driverAccess";
import { sendActivationEmail, validateActivationEmailPayload } from "../driverEmail";

export const driverActivationRouter = Router();

driverActivationRouter.post("/activate", async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res.status(503).json({ error: "Driver auth backend is not configured." });
    return;
  }
  const staff = await resolveStaffToken(supabase, (req.body ?? {}).staffToken);
  if (!staff) {
    res.status(401).json({ error: "Sign in to the office app to send activation emails." });
    return;
  }
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

driverActivationRouter.post("/auth", async (req, res) => {
  const { status, body } = await handleDriverAction(req.body);
  res.status(status).json(body);
});
