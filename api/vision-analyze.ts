/**
 * Vercel serverless twin of the Vite dev middleware vitePluginVisionApi — runs
 * the photo-analysis on the deployed static site (the live path).
 *
 * SELF-CONTAINED ON PURPOSE: Vercel compiles api/ functions as ES modules and
 * cannot resolve imports from ../server/* at runtime (same gotcha as
 * api/lead.ts). The logic below must be kept in sync with
 * server/visionAnalyze.ts — see that file's header for what it enforces
 * (server-owned model/prompt/token budget, office-login token for staff
 * calls, always-on rate limits).
 *
 * Env: OPENAI_API_KEY, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-side
 * only; never VITE_-prefixed). Vercel env changes require a redeploy.
 */

// Vision calls can take 15-40s; bump past the 10s default (capped by plan).
export const config = { maxDuration: 60 };

import { createClient, type SupabaseClient } from "@supabase/supabase-js";


const MAX_PHOTOS = 10;
const MAX_DETAILS_CHARS = 5000;
const MAX_PROMPT_CHARS = 20000;

/** Models the server will ever send to OpenAI. Anything else in the saved
 * settings falls back to the default. */
const ALLOWED_MODELS = new Set(["gpt-4.1-mini", "gpt-4.1", "gpt-4o"]);
const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 1500;
const MAX_TOKENS_CAP = 2500;

// Rate limits (in-memory: per warm instance on Vercel, so a blunt backstop,
// not a durable quota).
const PUBLIC_WINDOW_MS = 5 * 60 * 1000;
const PUBLIC_MAX_PER_IP = 20;
const STAFF_WINDOW_MS = 5 * 60 * 1000;
const STAFF_MAX_PER_ACCOUNT = 60;

interface VisionPayload {
  photos: string[];
  details: string;
  /** "public" for the marketing-site estimator, "" for the office Vision tab. */
  source: "public" | "";
  /** Office-login session token; required unless source is "public". */
  staffToken: string;
}

interface VisionRunResult {
  status: number;
  body: unknown;
}

function validateVisionPayload(body: unknown): VisionPayload | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.photos) || b.photos.length === 0 || b.photos.length > MAX_PHOTOS) {
    return null;
  }
  const photos = b.photos.filter(
    (p): p is string => typeof p === "string" && p.startsWith("data:image/"),
  );
  if (photos.length !== b.photos.length) return null;

  return {
    photos,
    details: typeof b.details === "string" ? b.details.slice(0, MAX_DETAILS_CHARS) : "",
    source: b.source === "public" ? "public" : "",
    staffToken: typeof b.staffToken === "string" ? b.staffToken : "",
  };
}

// ------------------------------------------------------------ Supabase admin

let adminClient: SupabaseClient | null | undefined;
function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  adminClient = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  if (!adminClient) {
    console.warn("[vision-api] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing; Vision AI disabled.");
  }
  return adminClient;
}

/** Resolves an office session token to an ACTIVE staff id, or null. */
async function resolveStaffToken(supabase: SupabaseClient, token: string): Promise<string | null> {
  if (!token) return null;
  const { data: session } = await supabase
    .from("staff_sessions")
    .select("staff_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null;
  const { data: staff } = await supabase
    .from("staff")
    .select("id, active")
    .eq("id", session.staff_id)
    .maybeSingle();
  if (!staff || !staff.active) return null;
  return staff.id as string;
}

// ------------------------------------------------------------ vision config

interface VisionConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  systemInstructions: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Loads the business's Vision settings from app_settings (key "vision") and
 * sanitises them. Returns null when the row is missing or has no prompt. */
async function loadVisionConfig(supabase: SupabaseClient): Promise<VisionConfig | null> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "vision").maybeSingle();
  const v = (data?.value && typeof data.value === "object" ? data.value : {}) as Record<string, unknown>;
  const systemInstructions =
    typeof v.systemInstructions === "string" ? v.systemInstructions.trim().slice(0, MAX_PROMPT_CHARS) : "";
  if (!systemInstructions) return null;
  const model = typeof v.model === "string" && ALLOWED_MODELS.has(v.model.trim()) ? v.model.trim() : DEFAULT_MODEL;
  const temperature =
    typeof v.temperature === "number" && Number.isFinite(v.temperature)
      ? clamp(v.temperature, 0, 1)
      : DEFAULT_TEMPERATURE;
  const maxTokens =
    typeof v.maxTokens === "number" && Number.isFinite(v.maxTokens)
      ? clamp(Math.round(v.maxTokens), 300, MAX_TOKENS_CAP)
      : DEFAULT_MAX_TOKENS;
  return { model, temperature, maxTokens, systemInstructions };
}

// ------------------------------------------------------------- rate limiting

const rateHits = new Map<string, number[]>();
function rateLimited(bucket: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const recent = (rateHits.get(bucket) ?? []).filter(t => now - t < windowMs);
  if (recent.length >= max) {
    rateHits.set(bucket, recent);
    return true;
  }
  recent.push(now);
  rateHits.set(bucket, recent);
  return false;
}

// ------------------------------------------------------------ request entry

const PUBLIC_LIMIT_MESSAGE =
  "You've run a lot of estimates in a short time. Please wait a few minutes, or call/text us for a quote.";

/**
 * Full request handling — auth, rate limit, config, OpenAI call. `ip` is the
 * caller's address (x-forwarded-for on Vercel, socket address in dev).
 */
async function handleVisionRequest(body: unknown, ip: string): Promise<VisionRunResult> {
  const payload = validateVisionPayload(body);
  if (!payload) {
    return { status: 400, body: { error: "Send 1-10 image data URLs." } };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { status: 503, body: { error: "Vision AI is not configured on the server." } };
  }

  if (payload.source === "public") {
    if (rateLimited(`ip:${ip || "unknown"}`, PUBLIC_WINDOW_MS, PUBLIC_MAX_PER_IP)) {
      return { status: 429, body: { error: PUBLIC_LIMIT_MESSAGE } };
    }
  } else {
    const staffId = await resolveStaffToken(supabase, payload.staffToken);
    if (!staffId) {
      return { status: 401, body: { error: "Please sign in to the office app to use Vision AI." } };
    }
    if (rateLimited(`staff:${staffId}`, STAFF_WINDOW_MS, STAFF_MAX_PER_ACCOUNT)) {
      return {
        status: 429,
        body: { error: "Too many analyses in a short time. Please wait a few minutes and try again." },
      };
    }
  }

  const visionConfig = await loadVisionConfig(supabase);
  if (!visionConfig) {
    return {
      status: 503,
      body: { error: "Vision AI isn't set up yet — open Estimate Settings → Vision AI and click Save once." },
    };
  }

  return runVisionAnalysis(payload, visionConfig);
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function runVisionAnalysis(payload: VisionPayload, config: VisionConfig): Promise<VisionRunResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: 502, body: { error: "OPENAI_API_KEY is not configured on the server." } };
  }

  const photoCount = payload.photos.length;
  const system = config.systemInstructions.replace(/\{photoCount\}/g, String(photoCount));
  const userText =
    `There ${photoCount === 1 ? "is" : "are"} ${photoCount} photo${photoCount === 1 ? "" : "s"}, numbered 1 to ${photoCount}.` +
    (payload.details.trim()
      ? `\n\nAdditional details from the user:\n${payload.details.trim()}`
      : "") +
    `\n\nReturn ONLY the JSON object described in the instructions.`;

  const content: ContentPart[] = [
    { type: "text", text: userText },
    ...payload.photos.map((url): ContentPart => ({ type: "image_url", image_url: { url } })),
  ];

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
      }),
    });
  } catch (error) {
    return {
      status: 502,
      body: { error: `Could not reach OpenAI: ${error instanceof Error ? error.message : String(error)}` },
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    let message = `OpenAI request failed (${response.status}).`;
    try {
      const parsed = JSON.parse(detail);
      if (parsed?.error?.message) message = parsed.error.message;
    } catch {
      // keep the generic message
    }
    return { status: 502, body: { error: message } };
  }

  const data = await response.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    return { status: 502, body: { error: "OpenAI returned an empty response." } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 502, body: { error: "OpenAI returned a response that wasn't valid JSON." } };
  }
  return { status: 200, body: normalizeResult(parsed) };
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeResult(raw: unknown) {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const itemBreakdown = Array.isArray(r.itemBreakdown)
    ? r.itemBreakdown.map((entry) => {
        const o = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
        return {
          item: typeof o.item === "string" ? o.item : "Item",
          quantity: Math.max(1, Math.round(toNumber(o.quantity, 1))),
          cubicYards: toNumber(o.cubicYards),
          weight: toNumber(o.weight),
        };
      })
    : [];

  const scrapMetalItems = Array.isArray(r.scrapMetalItems)
    ? r.scrapMetalItems.map((entry) => {
        const o = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
        return {
          type: typeof o.type === "string" ? o.type : "Metal",
          estimatedWeight: toNumber(o.estimatedWeight),
        };
      })
    : [];

  const detectedExtraFees = Array.isArray(r.detectedExtraFees)
    ? r.detectedExtraFees.map((entry) => {
        const o = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
        return {
          name: typeof o.name === "string" ? o.name : "Fee",
          quantity: Math.round(toNumber(o.quantity, 1)),
          totalPrice: toNumber(o.totalPrice),
        };
      })
    : [];

  return {
    cubicYards: toNumber(r.cubicYards),
    estimatedWeight: toNumber(r.estimatedWeight),
    confidence: Math.max(1, Math.min(100, Math.round(toNumber(r.confidence, 80)))),
    itemBreakdown,
    detectedExtraFees,
    scrapMetalItems,
    scrapMetalTotalWeight: toNumber(r.scrapMetalTotalWeight),
    analysis: typeof r.analysis === "string" ? r.analysis : "",
  };
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

function clientIp(req: VercelRequest): string {
  const xff = req.headers?.["x-forwarded-for"];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  return raw?.split(",")[0]?.trim() || "unknown";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
  const result = await handleVisionRequest(body, clientIp(req));
  res.status(result.status).json(result.body);
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
