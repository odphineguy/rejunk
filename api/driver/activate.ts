/**
 * Vercel serverless twin of the Express POST /api/driver/activate route, so
 * activation emails also send from the static Vercel deployment. Requires
 * RESEND_API_KEY in the Vercel project env. Vercel serves /api/* functions
 * before the SPA rewrite in vercel.json, so this doesn't collide with routing.
 */

import { sendActivationEmail, validateActivationEmailPayload } from "../../server/driverEmail";

type VercelRequest = { method?: string; body?: unknown };
type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
  const payload = validateActivationEmailPayload(body);
  if (!payload) {
    res.status(400).json({ error: "A valid email and activation key are required." });
    return;
  }
  const result = await sendActivationEmail(payload);
  if (!result.sent) {
    res.status(502).json({ error: result.error ?? "Email could not be sent." });
    return;
  }
  res.status(200).json({ sent: true });
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
