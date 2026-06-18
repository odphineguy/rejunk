/**
 * Shared Vision photo-analysis logic: calls OpenAI's vision API with the
 * business's editable System Instructions and returns the structured estimate
 * JSON. Used by the Vite dev middleware (vitePluginVisionApi in vite.config.ts).
 *
 * SELF-CONTAINED TWIN: the Vercel deployment uses api/vision-analyze.ts, which
 * cannot import ../server/* at runtime (same gotcha as api/lead.ts). Keep the
 * validation + OpenAI call below in sync with that file.
 *
 * Env: OPENAI_API_KEY (server-side only — never VITE_-prefixed).
 */

const MAX_PHOTOS = 10;

export interface VisionPayload {
  photos: string[];
  details: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemInstructions: string;
}

export function validateVisionPayload(body: unknown): VisionPayload | null {
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
  };
}

export interface VisionRunResult {
  status: number;
  body: unknown;
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export async function runVisionAnalysis(payload: VisionPayload): Promise<VisionRunResult> {
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

export function normalizeResult(raw: unknown) {
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
