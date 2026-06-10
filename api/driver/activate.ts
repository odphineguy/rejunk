/**
 * Vercel serverless twin of the Express POST /api/driver/activate route, so
 * activation emails also send from the static Vercel deployment. Requires
 * RESEND_API_KEY in the Vercel project env. Vercel serves /api/* functions
 * before the SPA rewrite in vercel.json, so this doesn't collide with routing.
 *
 * SELF-CONTAINED ON PURPOSE: Vercel compiles api/ functions as ES modules and
 * cannot resolve imports from ../../server/* at runtime (ERR_MODULE_NOT_FOUND
 * in production). The payload validation + email template below must be kept
 * in sync with server/driverEmail.ts (used by the Express route and the Vite
 * dev middleware).
 */

import { Resend } from "resend";

interface ActivationEmailPayload {
  email: string;
  activationKey: string;
  employeeName?: string;
  activationLink?: string;
  expiresAt?: string;
}

// Production sends from dispatch@dispatchai.help via RESEND_FROM (domain
// verified in Resend 2026-06-10; set in Vercel env + local .env). This default
// is only the fallback when RESEND_FROM is missing.
const DEFAULT_FROM = "Rejunk Dispatch <onboarding@resend.dev>";
const DEFAULT_BASE_URL = "https://rejunk.vercel.app";

function validateActivationEmailPayload(body: unknown): ActivationEmailPayload | null {
  if (!body || typeof body !== "object") return null;
  const { email, activationKey, employeeName, activationLink, expiresAt } = body as Record<string, unknown>;
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (typeof activationKey !== "string" || !/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(activationKey)) return null;
  return {
    email,
    activationKey,
    employeeName: typeof employeeName === "string" ? employeeName.slice(0, 120) : undefined,
    activationLink: typeof activationLink === "string" && /^https?:\/\//.test(activationLink) ? activationLink : undefined,
    expiresAt: typeof expiresAt === "string" ? expiresAt : undefined,
  };
}

function buildActivationEmailHtml(payload: ActivationEmailPayload) {
  const link = payload.activationLink ?? `${DEFAULT_BASE_URL}/driver/activate?key=${encodeURIComponent(payload.activationKey)}`;
  const greetingName = payload.employeeName?.split(" ")[0] || "there";
  const expiryLine = payload.expiresAt
    ? `This key expires on ${new Date(payload.expiresAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} (72 hours from now).`
    : "This key expires 72 hours after it was sent.";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f3;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1c1c">
    <div style="max-width:520px;margin:0 auto;padding:24px 16px">
      <div style="background:#ffffff;border-radius:12px;border:1px solid #e2e6df;overflow:hidden">
        <div style="padding:24px 24px 4px;text-align:center">
          <!-- The logo badge has its pine background baked into the PNG, and the
               header around it is left uncolored on purpose: Gmail dark mode
               re-lightens fixed dark backgrounds (pine's teal hue turns icy
               blue), so the badge is the only fixed-color element. Accent color
               elsewhere is moss #155e3f — a true-green hue that Gmail's
               inversion turns mint instead of blue. -->
          <img src="${DEFAULT_BASE_URL}/rejunk-email-logo.png" alt="Rejunk" height="66" style="height:66px;width:auto" />
        </div>
        <div style="padding:28px 24px">
          <h1 style="margin:0 0 12px;font-size:20px">Activate Your Rejunk Driver App</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Hi ${greetingName}, your dispatcher set you up with the Rejunk driver app. Use this activation key to get started:</p>
          <div style="background:#f0f4ec;border:1px dashed #155e3f;border-radius:10px;padding:18px;text-align:center;margin:0 0 20px">
            <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:24px;font-weight:700;letter-spacing:2px;color:#155e3f">${payload.activationKey}</span>
          </div>
          <div style="text-align:center;margin:0 0 20px">
            <a href="${link}" style="display:inline-block;background:#155e3f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px">Open the Driver App</a>
          </div>
          <p style="margin:0 0 8px;font-size:13px;color:#5b6357;line-height:1.5">${expiryLine}</p>
          <p style="margin:0;font-size:13px;color:#5b6357;line-height:1.5">You'll set a 4-digit PIN the first time you sign in. Questions? Call or text your dispatcher.</p>
        </div>
      </div>
      <p style="text-align:center;font-size:12px;color:#8a917f;margin:16px 0 0">Rejunk · Phoenix, AZ</p>
    </div>
  </body>
</html>`;
}

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
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(502).json({ error: "RESEND_API_KEY is not configured on the server." });
    return;
  }
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || DEFAULT_FROM,
      to: payload.email,
      subject: "Activate Your Rejunk Driver App",
      html: buildActivationEmailHtml(payload),
    });
    if (error) {
      res.status(502).json({ error: error.message });
      return;
    }
    res.status(200).json({ sent: true });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
