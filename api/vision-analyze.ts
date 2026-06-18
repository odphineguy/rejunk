/**
 * Vercel serverless twin of the Vite dev middleware vitePluginVisionApi — runs
 * the photo-analysis on the deployed static site (the live path).
 *
 * SELF-CONTAINED ON PURPOSE: Vercel compiles api/ functions as ES modules and
 * cannot resolve imports from ../server/* at runtime (same gotcha as
 * api/lead.ts). The validation + OpenAI call below must be kept in sync with
 * server/visionAnalyze.ts.
 *
 * Env: OPENAI_API_KEY (server-side only; never VITE_-prefixed). Vercel env
 * changes require a redeploy.
 */

// Vision calls can take 15-40s; bump past the 10s default (capped by plan).
export const config = { maxDuration: 60 };

const MAX_PHOTOS = 10;

interface VisionPayload {
  photos: string[];
  details: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemInstructions: string;
  /** "public" for the marketing-site estimator (rate-limited by IP below), ""
   * for the logged-in staff Vision tab (never throttled). */
  source: string;
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

  const systemInstructions =
    typeof b.systemInstructions === "string" && b.systemInstructions.trim()
      ? b.systemInstructions.slice(0, 20000)
      : "";
  if (!systemInstructions) return null;

  return {
    photos,
    details: typeof b.details === "string" ? b.details.slice(0, 5000) : "",
    model: typeof b.model === "string" && b.model.trim() ? b.model.trim() : "gpt-4.1-mini",
    temperature: typeof b.temperature === "number" ? b.temperature : 0.3,
    maxTokens: typeof b.maxTokens === "number" ? b.maxTokens : 1500,
    systemInstructions,
    source: b.source === "public" ? "public" : "",
  };
}

/**
 * Best-effort per-IP rate limit for the PUBLIC marketing estimator only — a
 * backstop against someone scripting the unauthenticated endpoint to burn
 * OpenAI credit. Staff Vision-tab calls send no `source`, so they're never
 * throttled. NOTE: this is in-memory, so on serverless it only holds within a
 * warm instance and resets on cold start — good enough to blunt casual abuse,
 * not a substitute for durable rate limiting (Vercel KV / Upstash) if real
 * abuse ever shows up.
 */
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 20;
const rateHits = new Map<string, number[]>();

function clientIp(req: VercelRequest): string {
  const xff = req.headers?.["x-forwarded-for"];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  return raw?.split(",")[0]?.trim() || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (rateHits.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    rateHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateHits.set(ip, recent);
  return false;
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function runVisionAnalysis(
  payload: VisionPayload,
): Promise<{ status: number; body: unknown }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: 502, body: { error: "OPENAI_API_KEY is not configured on the server." } };
  }

  const photoCount = payload.photos.length;
  const system = payload.systemInstructions.replace(/\{photoCount\}/g, String(photoCount));
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
        model: payload.model,
        temperature: payload.temperature,
        max_tokens: payload.maxTokens,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
  const payload = validateVisionPayload(body);
  if (!payload) {
    res.status(400).json({ error: "Send 1-10 image data URLs plus the system instructions." });
    return;
  }
  if (payload.source === "public" && isRateLimited(clientIp(req))) {
    res.status(429).json({
      error: "You've run a lot of estimates in a short time. Please wait a few minutes, or call/text us for a quote.",
    });
    return;
  }
  const result = await runVisionAnalysis(payload);
  res.status(result.status).json(result.body);
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
