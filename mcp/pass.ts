// Checks an AI app's pass (an OAuth access token issued by Supabase after the
// person approved the app on /oauth/consent) before anything else runs.
//
// This folder must never import server/* or use the master database key:
// every query runs AS the person, so the database rules decide what the AI
// sees (app_private.ai_reader, migration 20261010025917). Enforced by
// scripts/security/check-mcp-imports.mjs inside `pnpm check`.
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface McpConfig {
  supabaseUrl: string;
  anonKey: string;
}

export function mcpConfig(): McpConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return supabaseUrl && anonKey ? { supabaseUrl: supabaseUrl.replace(/\/$/, ""), anonKey } : null;
}

export interface AiPass {
  token: string;
  userId: string;
  clientId: string;
  sessionId: string;
}

let keys: { url: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null;
function signingKeys(supabaseUrl: string) {
  if (!keys || keys.url !== supabaseUrl) {
    keys = { url: supabaseUrl, set: createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)) };
  }
  return keys.set;
}

/**
 * The pass must be signed by our Supabase project, unexpired, and issued to an
 * approved AI app (client_id + its own session). Audience: Supabase always
 * stamps "authenticated" and cannot stamp our MCP URL (Known Issue in
 * PLAN-mcp-connector.md); the database binds the pass to the app's own session.
 */
export async function verifyAiPass(header: string | undefined, config: McpConfig): Promise<AiPass | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!match) return null;
  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(match[1], signingKeys(config.supabaseUrl), {
      issuer: `${config.supabaseUrl}/auth/v1`,
      audience: "authenticated",
    }));
  } catch {
    return null;
  }
  const clientId = typeof claims.client_id === "string" ? claims.client_id : "";
  const sessionId = typeof claims.session_id === "string" ? claims.session_id : "";
  if (!claims.sub || !clientId || !sessionId || claims.role !== "authenticated") return null;
  return { token: match[1], userId: claims.sub, clientId, sessionId };
}
