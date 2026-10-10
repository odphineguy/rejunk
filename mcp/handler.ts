// The Rejunk MCP endpoint (/api/mcp) — where Claude / ChatGPT connect.
//
// Shared by the Vercel function (api/mcp.js, built by scripts/security/build-mcp.mjs)
// and the Vite dev middleware. Stateless: every request builds a fresh server
// that acts AS the person who approved the AI app (anon key + their pass), so
// the database rules decide what it sees. Read-only for now (Phase 3).
import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mcpConfig, verifyAiPass, type McpConfig } from "./pass";

const MCP_PATH = "/api/mcp";
const METADATA_PATH = "/.well-known/oauth-protected-resource";

function origin(req: IncomingMessage): string {
  const proto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0] || "http";
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:3000").split(",")[0];
  return `${proto}://${host}`;
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function cors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id");
}

/** RFC 9728: tells the AI app which login (Supabase OAuth server) issues passes for us. */
export function protectedResourceMetadata(req: IncomingMessage, config: McpConfig) {
  return {
    resource: `${origin(req)}${MCP_PATH}`,
    authorization_servers: [`${config.supabaseUrl}/auth/v1`],
    bearer_methods_supported: ["header"],
    resource_name: "Rejunk",
  };
}

async function readJson(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new Error("Request too large");
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
}

function buildServer(db: SupabaseClient): McpServer {
  const server = new McpServer({ name: "rejunk", version: "0.1.0" });
  server.registerTool(
    "rejunk_whoami",
    {
      title: "Who am I in Rejunk",
      description: "Shows which Rejunk company and role this connection reads as, and how many jobs that company has.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const { data, error } = await db.rpc("mcp_whoami");
      if (error) {
        return { isError: true, content: [{ type: "text", text: "This connection isn't approved to read Rejunk data. Reconnect the app and approve it again." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  );
  return server;
}

export async function handleMcpRequest(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const config = mcpConfig();
  if (!config) { send(res, 503, { error: "MCP server is not configured" }); return; }

  // vercel.json rewrites the well-known path to /api/mcp?resource-metadata.
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname.startsWith(METADATA_PATH) || url.searchParams.has("resource-metadata")) {
    if (req.method !== "GET") { send(res, 405, { error: "Method not allowed" }); return; }
    send(res, 200, protectedResourceMetadata(req, config), { "Cache-Control": "public, max-age=300" });
    return;
  }

  const pass = await verifyAiPass(req.headers.authorization, config);
  if (!pass) {
    const metadataUrl = `${origin(req)}${METADATA_PATH}`;
    const error = req.headers.authorization ? ', error="invalid_token"' : "";
    send(res, 401, { error: "Sign in to Rejunk and approve this app first." },
      { "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}"${error}` });
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }, { Allow: "POST" });
    return;
  }

  let body: unknown;
  try { body = await readJson(req); } catch {
    send(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
    return;
  }

  const db = createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${pass.token}` } },
  });
  const server = buildServer(db);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
