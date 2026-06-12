/**
 * Website estimate-request leads: payload validation + the Resend email to
 * the owner. Shared by the Express route (server/routes/lead.ts) and the Vite
 * dev middleware (vite.config.ts). The Vercel function api/lead.ts is a
 * SELF-CONTAINED COPY of this logic (Vercel can't import ../server/* at
 * runtime) — keep the three in sync, same convention as driverEmail.ts.
 */

import { Resend } from "resend";

const ALLOWED_SERVICES = ["Junk Removal", "Moving", "Assembly & Handyman"] as const;

// TODO: set LEAD_TO in the env (local .env + Vercel) — falls back to the owner.
const DEFAULT_LEAD_TO = "odphineguy@gmail.com";
const DEFAULT_FROM = "Rejunk Website <onboarding@resend.dev>";

export interface LeadPayload {
  services: string[];
  details: Record<string, string>;
  zip: string;
  timing: string;
  name: string;
  phone: string;
  email: string;
  /** Honeypot field — non-empty means a bot filled the hidden input. */
  isBot: boolean;
}

export function validateLeadPayload(body: unknown): LeadPayload | null {
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

export function buildLeadEmailHtml(lead: LeadPayload): string {
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

export async function sendLeadEmail(lead: LeadPayload): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY is not configured on the server." };
  try {
    const resend = new Resend(apiKey);
    const subject = `New website lead — ${lead.services.join(" + ")}${lead.zip ? ` — ${lead.zip}` : ""}`;
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || DEFAULT_FROM,
      to: process.env.LEAD_TO || DEFAULT_LEAD_TO,
      subject,
      html: buildLeadEmailHtml(lead),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}
