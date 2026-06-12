/**
 * Vercel serverless twin of the Express POST /api/lead route, so estimate
 * requests from the public site also send on the static Vercel deployment.
 *
 * SELF-CONTAINED ON PURPOSE: Vercel compiles api/ functions as ES modules and
 * cannot resolve imports from ../server/* at runtime (same gotcha as
 * api/driver/activate.ts). Validation + email template below must be kept in
 * sync with server/leadEmail.ts (Express route + Vite dev middleware).
 *
 * Env: RESEND_API_KEY (+ optional RESEND_FROM, LEAD_TO) — remember Vercel env
 * changes need a redeploy.
 */

import { Resend } from "resend";

const ALLOWED_SERVICES = ["Junk Removal", "Moving", "Assembly & Handyman"] as const;

// TODO: set LEAD_TO in the Vercel env — falls back to the owner.
const DEFAULT_LEAD_TO = "odphineguy@gmail.com";
const DEFAULT_FROM = "Rejunk Website <onboarding@resend.dev>";

interface LeadPayload {
  services: string[];
  details: Record<string, string>;
  zip: string;
  timing: string;
  name: string;
  phone: string;
  email: string;
  isBot: boolean;
}

function validateLeadPayload(body: unknown): LeadPayload | null {
  if (!body || typeof body !== "object") return null;
  const { services, details, zip, timing, name, phone, email, company } = body as Record<string, unknown>;

  if (!Array.isArray(services) || services.length === 0 || services.length > 3) return null;
  const cleanServices = services.filter(
    (s): s is string => typeof s === "string" && (ALLOWED_SERVICES as readonly string[]).includes(s),
  );
  if (cleanServices.length !== services.length) return null;

  if (typeof name !== "string" || !name.trim() || name.length > 120) return null;
  if (typeof phone !== "string" || !/^[\d\s()+.-]{7,20}$/.test(phone.trim())) return null;
  if (email !== undefined && (typeof email !== "string" || email.length > 200)) return null;
  if (typeof email === "string" && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return null;
  if (zip !== undefined && (typeof zip !== "string" || (zip !== "" && !/^\d{5}$/.test(zip)))) return null;
  if (typeof timing !== "string" || timing.length > 40) return null;

  const cleanDetails: Record<string, string> = {};
  if (details && typeof details === "object") {
    for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
      if (cleanServices.includes(key) && typeof value === "string" && value.trim()) {
        cleanDetails[key] = value.slice(0, 1000);
      }
    }
  }

  return {
    services: cleanServices,
    details: cleanDetails,
    zip: typeof zip === "string" ? zip : "",
    timing: timing.trim(),
    name: name.trim(),
    phone: (phone as string).trim(),
    email: typeof email === "string" ? email.trim() : "",
    isBot: typeof company === "string" && company.trim().length > 0,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildLeadEmailHtml(lead: LeadPayload): string {
  const detailRows = lead.services
    .map(service => {
      const note = lead.details[service];
      return `<tr>
        <td style="padding:6px 12px 6px 0;font-weight:600;vertical-align:top;white-space:nowrap">${escapeHtml(service)}</td>
        <td style="padding:6px 0;color:#374151">${note ? escapeHtml(note) : "<em>no details given</em>"}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f3;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1c1c">
    <div style="max-width:520px;margin:0 auto;padding:24px 16px">
      <div style="background:#ffffff;border-radius:12px;border:1px solid #e2e6df;padding:28px 24px">
        <h1 style="margin:0 0 4px;font-size:20px">New website lead</h1>
        <p style="margin:0 0 20px;font-size:14px;color:#5b6357">${escapeHtml(lead.services.join(" + "))}${lead.zip ? ` — ${escapeHtml(lead.zip)}` : ""} · wants it: ${escapeHtml(lead.timing)}</p>
        <div style="background:#f0f4ec;border-radius:10px;padding:16px;margin:0 0 20px">
          <p style="margin:0 0 6px;font-size:16px;font-weight:700">${escapeHtml(lead.name)}</p>
          <p style="margin:0;font-size:15px"><a href="tel:${escapeHtml(lead.phone)}" style="color:#155e3f;font-weight:600">${escapeHtml(lead.phone)}</a></p>
          ${lead.email ? `<p style="margin:6px 0 0;font-size:14px"><a href="mailto:${escapeHtml(lead.email)}" style="color:#155e3f">${escapeHtml(lead.email)}</a></p>` : ""}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${detailRows}</table>
        <p style="margin:20px 0 0;font-size:13px;color:#5b6357">They were told to expect a text or call back within the hour during business hours.</p>
      </div>
      <p style="text-align:center;font-size:12px;color:#8a917f;margin:16px 0 0">Rejunk website estimate form</p>
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
  const lead = validateLeadPayload(body);
  if (!lead) {
    res.status(400).json({ error: "A name, phone number, and at least one service are required." });
    return;
  }
  // Honeypot hit: pretend success so bots don't learn the field exists.
  if (lead.isBot) {
    res.status(200).json({ sent: true });
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(502).json({ error: "RESEND_API_KEY is not configured on the server." });
    return;
  }
  try {
    const resend = new Resend(apiKey);
    const subject = `New website lead — ${lead.services.join(" + ")}${lead.zip ? ` — ${lead.zip}` : ""}`;
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || DEFAULT_FROM,
      to: process.env.LEAD_TO || DEFAULT_LEAD_TO,
      subject,
      html: buildLeadEmailHtml(lead),
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
