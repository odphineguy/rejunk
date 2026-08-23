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

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const ALLOWED_SERVICES = [
  "Junk Removal",
  "Moving",
  "Assembly",
  "Piano Moving",
] as const;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_LEADS_PER_WINDOW = 5;
const leadAttempts = new Map<string, { count: number; resetAt: number }>();

// TODO: set LEAD_TO in the Vercel env — falls back to the owner.
const DEFAULT_LEAD_TO = "abe@saguarotransport.com";
const LEAD_FROM_NAME = "Progressive Transportation Services";
const DEFAULT_FROM_ADDRESS = "onboarding@resend.dev";

/**
 * Lead notifications should read as "Progressive Transportation Services" in the
 * owner's inbox — but reuse the *verified sending address* from the shared
 * RESEND_FROM (branded "Rejunk Dispatch" for driver/staff mail). Keep the
 * address, override only the display name. Falls back to the Resend sandbox
 * address when RESEND_FROM is unset.
 */
function leadFromAddress(): string {
  const configured = process.env.RESEND_FROM ?? "";
  const inAngles = configured.match(/<([^>]+)>/)?.[1];
  const address =
    inAngles ??
    (configured.includes("@") ? configured.trim() : DEFAULT_FROM_ADDRESS);
  return `${LEAD_FROM_NAME} <${address}>`;
}

interface LeadPayload {
  services: string[];
  details: Record<string, string>;
  zip: string;
  timing: string;
  name: string;
  phone: string;
  email: string;
  smsConsent: boolean;
  isBot: boolean;
  /** Where the lead came from, e.g. "AI Estimate". Empty = the regular form. */
  source: string;
  /** Plain-text AI estimate summary (items + ballpark price), when present. */
  aiSummary: string;
}

function validateLeadPayload(body: unknown): LeadPayload | null {
  if (!body || typeof body !== "object") return null;
  const {
    services,
    details,
    zip,
    timing,
    name,
    phone,
    email,
    smsConsent,
    company,
    source,
    aiSummary,
  } = body as Record<string, unknown>;

  if (!Array.isArray(services) || services.length === 0 || services.length > 4)
    return null;
  const cleanServices = services.filter(
    (s): s is string =>
      typeof s === "string" &&
      (ALLOWED_SERVICES as readonly string[]).includes(s)
  );
  if (cleanServices.length !== services.length) return null;

  if (typeof name !== "string" || !name.trim() || name.length > 120)
    return null;
  if (typeof phone !== "string" || !/^[\d\s()+.-]{7,20}$/.test(phone.trim()))
    return null;
  if (email !== undefined && (typeof email !== "string" || email.length > 200))
    return null;
  if (
    typeof email === "string" &&
    email.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  )
    return null;
  if (
    zip !== undefined &&
    (typeof zip !== "string" || (zip !== "" && !/^\d{5}$/.test(zip)))
  )
    return null;
  if (typeof timing !== "string" || timing.length > 40) return null;

  const cleanDetails: Record<string, string> = {};
  if (details && typeof details === "object") {
    for (const [key, value] of Object.entries(
      details as Record<string, unknown>
    )) {
      if (
        cleanServices.includes(key) &&
        typeof value === "string" &&
        value.trim()
      ) {
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
    smsConsent: smsConsent === true,
    isBot: typeof company === "string" && company.trim().length > 0,
    source: typeof source === "string" ? source.slice(0, 60).trim() : "",
    aiSummary:
      typeof aiSummary === "string" ? aiSummary.slice(0, 4000).trim() : "",
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Heading/subject label — distinguishes the AI photo estimator from the
 * regular callback form so the owner can tell at a glance which arrived. */
function leadKindLabel(lead: LeadPayload): string {
  return lead.source === "AI Estimate" || lead.aiSummary
    ? "New AI estimate lead"
    : "New website lead";
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

  const aiBlock = lead.aiSummary
    ? `<div style="background:#eef6ee;border:1px solid #cfe6cf;border-radius:10px;padding:16px;margin:0 0 20px">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#155e3f">AI photo estimate</p>
          <p style="margin:0;font-size:14px;color:#1c1c1c;white-space:pre-wrap">${escapeHtml(lead.aiSummary)}</p>
        </div>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f3;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1c1c">
    <div style="max-width:520px;margin:0 auto;padding:24px 16px">
      <div style="background:#ffffff;border-radius:12px;border:1px solid #e2e6df;padding:28px 24px">
        <h1 style="margin:0 0 4px;font-size:20px">${leadKindLabel(lead)}</h1>
        <p style="margin:0 0 20px;font-size:14px;color:#5b6357">${escapeHtml(lead.services.join(" + "))}${lead.zip ? ` — ${escapeHtml(lead.zip)}` : ""} · wants it: ${escapeHtml(lead.timing)}</p>
        <div style="background:#f0f4ec;border-radius:10px;padding:16px;margin:0 0 20px">
          <p style="margin:0 0 6px;font-size:16px;font-weight:700">${escapeHtml(lead.name)}</p>
          <p style="margin:0;font-size:15px"><a href="tel:${escapeHtml(lead.phone)}" style="color:#155e3f;font-weight:600">${escapeHtml(lead.phone)}</a></p>
          ${lead.email ? `<p style="margin:6px 0 0;font-size:14px"><a href="mailto:${escapeHtml(lead.email)}" style="color:#155e3f">${escapeHtml(lead.email)}</a></p>` : ""}
        </div>
        ${aiBlock}
        <table style="width:100%;border-collapse:collapse;font-size:14px">${detailRows}</table>
        <p style="margin:16px 0 0;font-size:13px;font-weight:600;color:${lead.smsConsent ? "#155e3f" : "#9a6a00"}">${lead.smsConsent ? "✓ Opted in to SMS updates" : "✗ Did not opt in to SMS — call only"}</p>
        <p style="margin:20px 0 0;font-size:13px;color:#5b6357">They were told to expect a text or call back within the hour during business hours.</p>
      </div>
      <p style="text-align:center;font-size:12px;color:#8a917f;margin:16px 0 0">Progressive Transportation Services website estimate form</p>
    </div>
  </body>
</html>`;
}

function leadRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = leadAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    leadAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_LEADS_PER_WINDOW;
}

async function sendLeadEmail(lead: LeadPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: "Email is not configured." };
  try {
    const resend = new Resend(apiKey);
    const subject = `${leadKindLabel(lead)} — ${lead.services.join(" + ")}${lead.zip ? ` — ${lead.zip}` : ""}`;
    const { error } = await resend.emails.send({
      from: leadFromAddress(),
      to: process.env.LEAD_TO || DEFAULT_LEAD_TO,
      subject,
      html: buildLeadEmailHtml(lead),
    });
    return error
      ? { sent: false, error: error.message }
      : { sent: true, error: undefined };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function recordLeadInCrm(lead: LeadPayload) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return { recorded: false, error: "CRM connection is not configured." };

  const parts = lead.name.trim().split(/\s+/);
  const firstName = parts.shift() || lead.name;
  const lastName = parts.join(" ");
  const now = new Date().toISOString();
  const id = `website-lead-${randomUUID()}`;
  const detailLines = lead.services.map(service =>
    lead.details[service] ? `${service}: ${lead.details[service]}` : service
  );
  const summary = [
    `${lead.source || "Website"} request — ${lead.services.join(" + ")}.`,
    `Wants it: ${lead.timing}.`,
    lead.zip ? `ZIP ${lead.zip}.` : "",
    lead.smsConsent ? "Opted in to SMS updates." : "Did NOT opt in to SMS.",
    detailLines.length ? `Details — ${detailLines.join(" · ")}` : "",
    lead.aiSummary ? `AI estimate — ${lead.aiSummary}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const data = {
    id,
    kind: "lead",
    firstName,
    lastName,
    phone: lead.phone,
    ...(lead.email ? { email: lead.email } : {}),
    ...(lead.zip ? { zip: lead.zip } : {}),
    smsSetting: lead.smsConsent ? "receive" : "do_not_receive",
    leadSource: lead.source === "AI Estimate" ? "AI Estimate" : "Website",
    tags: ["Website", ...lead.services],
    contactLog: [
      {
        id: randomUUID(),
        createdAt: now,
        author: "Website",
        text: summary,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.from("clients").insert({
      id,
      created_by: null,
      kind: "lead",
      first_name: firstName,
      last_name: lastName,
      company: null,
      email: lead.email || null,
      phone: lead.phone,
      data,
    });
    return error
      ? { recorded: false, error: error.message }
      : { recorded: true, error: undefined };
  } catch (error) {
    return {
      recorded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};
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
    res.status(400).json({
      error: "A name, phone number, and at least one service are required.",
    });
    return;
  }
  // Honeypot hit: pretend success so bots don't learn the field exists.
  if (lead.isBot) {
    res.status(200).json({ sent: true, recorded: true });
    return;
  }
  const forwarded = req.headers?.["x-forwarded-for"];
  const ip =
    (Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(",")[0]
    )?.trim() || "unknown";
  if (leadRateLimited(ip)) {
    res
      .status(429)
      .json({ error: "Please wait before sending another request." });
    return;
  }
  const [email, crm] = await Promise.all([
    sendLeadEmail(lead),
    recordLeadInCrm(lead),
  ]);
  if (email.error) console.error("[lead-api] Email failed:", email.error);
  if (crm.error) console.error("[lead-api] CRM failed:", crm.error);
  if (!crm.recorded) {
    res
      .status(502)
      .json({ error: "The request could not be saved. Please try again." });
    return;
  }
  res.status(200).json({ sent: email.sent, recorded: true });
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
