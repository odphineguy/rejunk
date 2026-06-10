/**
 * Driver activation email, sent through Resend (RESEND_API_KEY).
 * Shared by the Express route (server/routes/driverActivation.ts) and the Vite
 * dev middleware (vite.config.ts). The Vercel function (api/driver/activate.ts)
 * carries its own COPY of this validation + template — Vercel can't import
 * across api/ boundaries at runtime — so changes here must be mirrored there.
 */

import { Resend } from "resend";

export interface ActivationEmailPayload {
  email: string;
  activationKey: string;
  employeeName?: string;
  activationLink?: string;
  expiresAt?: string;
}

// Unverified domains can only send from Resend's shared sender. Set RESEND_FROM
// once the rejunk domain is verified in Resend.
const DEFAULT_FROM = "Rejunk Dispatch <onboarding@resend.dev>";
const DEFAULT_BASE_URL = "https://rejunk.vercel.app";

export function validateActivationEmailPayload(body: unknown): ActivationEmailPayload | null {
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

export function buildActivationEmailHtml(payload: ActivationEmailPayload) {
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
        <div style="background:#052a2b;padding:20px 24px;text-align:center">
          <!-- The logo PNG has the pine background baked in so it stays readable
               even when email clients (Gmail dark mode) invert the header color. -->
          <img src="${DEFAULT_BASE_URL}/rejunk-email-logo.png" alt="Rejunk" height="66" style="height:66px;width:auto;border-radius:10px" />
        </div>
        <div style="padding:28px 24px">
          <h1 style="margin:0 0 12px;font-size:20px">Activate Your Rejunk Driver App</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Hi ${greetingName}, your dispatcher set you up with the Rejunk driver app. Use this activation key to get started:</p>
          <div style="background:#f0f4ec;border:1px dashed #052a2b;border-radius:10px;padding:18px;text-align:center;margin:0 0 20px">
            <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:24px;font-weight:700;letter-spacing:2px;color:#052a2b">${payload.activationKey}</span>
          </div>
          <div style="text-align:center;margin:0 0 20px">
            <a href="${link}" style="display:inline-block;background:#052a2b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px">Open the Driver App</a>
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

export async function sendActivationEmail(payload: ActivationEmailPayload): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY is not configured on the server." };

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || DEFAULT_FROM,
      to: payload.email,
      subject: "Activate Your Rejunk Driver App",
      html: buildActivationEmailHtml(payload),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}
