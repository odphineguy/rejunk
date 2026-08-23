import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map(entry => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", chunk => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

function vitePluginStorageProxy(): Plugin {
  return {
    name: "manus-storage-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/manus-storage", async (req, res) => {
        const key = req.url?.replace(/^\//, "");
        if (!key) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing storage key");
          return;
        }

        const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(
          /\/+$/,
          ""
        );
        const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

        if (!forgeBaseUrl || !forgeKey) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Storage proxy not configured");
          return;
        }

        try {
          const forgeUrl = new URL(
            "v1/storage/presign/get",
            forgeBaseUrl + "/"
          );
          forgeUrl.searchParams.set("path", key);

          const forgeResp = await fetch(forgeUrl, {
            headers: { Authorization: `Bearer ${forgeKey}` },
          });

          if (!forgeResp.ok) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Storage backend error");
            return;
          }

          const { url } = (await forgeResp.json()) as { url: string };
          if (!url) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Empty signed URL");
            return;
          }

          res.writeHead(307, { Location: url, "Cache-Control": "no-store" });
          res.end();
        } catch {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Storage proxy error");
        }
      });
    },
  };
}

function vitePluginMapsProxy(): Plugin {
  return {
    name: "manus-maps-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/maps-proxy", async (req, res) => {
        const googleMapsKey =
          process.env.GOOGLE_MAPS_API_KEY ||
          process.env.VITE_GOOGLE_MAPS_API_KEY;

        if (!googleMapsKey) {
          console.warn(
            "[Map] GOOGLE_MAPS_API_KEY missing in dev server env; maps proxy cannot load Google Maps."
          );
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(
            "Maps proxy not configured. Set GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY."
          );
          return;
        }

        try {
          console.info(
            "[Map] GOOGLE_MAPS_API_KEY present in dev server env; proxying Google Maps request."
          );
          const upstreamUrl = new URL(
            req.url || "",
            "https://maps.googleapis.com"
          );
          upstreamUrl.searchParams.set("key", googleMapsKey);

          const upstreamResponse = await fetch(upstreamUrl);
          const headers = new Headers(upstreamResponse.headers);
          headers.delete("content-encoding");
          headers.delete("content-length");

          res.writeHead(
            upstreamResponse.status,
            Object.fromEntries(headers.entries())
          );
          const body = Buffer.from(await upstreamResponse.arrayBuffer());
          res.end(body);
        } catch (error) {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end(`Maps proxy error: ${String(error)}`);
        }
      });
    },
  };
}

// Dev-server twin of the Express POST /api/driver/activate route (the Vite dev
// server doesn't run Express, same situation as the maps proxy above). Key/PIN
// validation doesn't need a dev endpoint — the browser does that directly
// against Supabase via client/src/lib/driverSession.ts.
function vitePluginDriverApi(): Plugin {
  return {
    name: "rejunk-driver-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/driver/activate", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "POST only" }));
          return;
        }
        let body = "";
        req.on("data", chunk => {
          body += chunk.toString();
        });
        req.on("end", () => {
          void (async () => {
            try {
              const { sendActivationEmail, validateActivationEmailPayload } =
                await import("./server/driverEmail");
              const payload = validateActivationEmailPayload(
                JSON.parse(body || "{}")
              );
              if (!payload) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error: "A valid email and activation key are required.",
                  })
                );
                return;
              }
              const result = await sendActivationEmail(payload);
              res.writeHead(result.sent ? 200 : 502, {
                "Content-Type": "application/json",
              });
              res.end(
                JSON.stringify(
                  result.sent
                    ? { sent: true }
                    : { error: result.error ?? "Email could not be sent." }
                )
              );
            } catch (error) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: String(error) }));
            }
          })();
        });
      });
    },
  };
}

// Dev-server twin of the Express POST /api/staff route (office login + office
// access management). Unlike the driver activation middleware this one talks to
// Supabase with the service-role key, so the dev server needs SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY in process.env (copied from .env below).
function vitePluginStaffApi(): Plugin {
  return {
    name: "rejunk-staff-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/staff", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "POST only" }));
          return;
        }
        let body = "";
        req.on("data", chunk => {
          body += chunk.toString();
        });
        req.on("end", () => {
          void (async () => {
            try {
              const { handleStaffAction } = await import(
                "./server/staffAccess"
              );
              const result = await handleStaffAction(JSON.parse(body || "{}"));
              res.writeHead(result.status, {
                "Content-Type": "application/json",
              });
              res.end(JSON.stringify(result.body));
            } catch (error) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: String(error) }));
            }
          })();
        });
      });
    },
  };
}

// Dev-server twin of the Express POST /api/lead route (website estimate-form
// leads), same situation as the driver activation middleware above. The
// deployed static site uses the Vercel function api/lead.ts instead.
function vitePluginLeadApi(): Plugin {
  return {
    name: "rejunk-lead-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/lead", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "POST only" }));
          return;
        }
        let body = "";
        req.on("data", chunk => {
          body += chunk.toString();
        });
        req.on("end", () => {
          void (async () => {
            try {
              const { leadRateLimited, processLead, validateLeadPayload } =
                await import("./server/leadEmail");
              const lead = validateLeadPayload(JSON.parse(body || "{}"));
              if (!lead) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error:
                      "A name, phone number, and at least one service are required.",
                  })
                );
                return;
              }
              if (lead.isBot) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ sent: true, recorded: true }));
                return;
              }
              const forwarded = req.headers["x-forwarded-for"];
              const ip =
                (Array.isArray(forwarded)
                  ? forwarded[0]
                  : forwarded?.split(",")[0]
                )?.trim() ||
                req.socket.remoteAddress ||
                "unknown";
              if (leadRateLimited(ip)) {
                res.writeHead(429, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error: "Please wait before sending another request.",
                  })
                );
                return;
              }
              const result = await processLead(lead);
              if (result.emailError)
                console.error("[lead-api] Email failed:", result.emailError);
              if (result.crmError)
                console.error("[lead-api] CRM failed:", result.crmError);
              res.writeHead(result.recorded ? 200 : 502, {
                "Content-Type": "application/json",
              });
              res.end(
                JSON.stringify(
                  result.recorded
                    ? { sent: result.sent, recorded: true }
                    : {
                        error:
                          "The request could not be saved. Please try again.",
                      }
                )
              );
            } catch (error) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: String(error) }));
            }
          })();
        });
      });
    },
  };
}

// Dev-server twin of the Vercel api/vision-analyze.ts function (photo-based
// estimating via OpenAI). The deployed static site uses the Vercel function
// instead. Reads OPENAI_API_KEY from process.env (copied from .env below).
function vitePluginVisionApi(): Plugin {
  return {
    name: "rejunk-vision-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/vision-analyze", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "POST only" }));
          return;
        }
        let body = "";
        req.on("data", chunk => {
          body += chunk.toString();
        });
        req.on("end", () => {
          void (async () => {
            try {
              const { runVisionAnalysis, validateVisionPayload } = await import(
                "./server/visionAnalyze"
              );
              const payload = validateVisionPayload(JSON.parse(body || "{}"));
              if (!payload) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error:
                      "Send 1-10 image data URLs plus the system instructions.",
                  })
                );
                return;
              }
              const result = await runVisionAnalysis(payload);
              res.writeHead(result.status, {
                "Content-Type": "application/json",
              });
              res.end(JSON.stringify(result.body));
            } catch (error) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: String(error) }));
            }
          })();
        });
      });
    },
  };
}

const plugins = [
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  vitePluginManusRuntime(),
  vitePluginManusDebugCollector(),
  vitePluginStorageProxy(),
  vitePluginMapsProxy(),
  vitePluginDriverApi(),
  vitePluginStaffApi(),
  vitePluginLeadApi(),
  vitePluginVisionApi(),
];

export default defineConfig(({ mode }) => {
  // Vite only hands VITE_-prefixed values to the browser. The dev maps + storage
  // proxies run on the server side and read these from process.env, so load the
  // .env file here and copy the keys in — otherwise the maps proxy can't find the
  // Google key and the map silently falls back to the local placeholder view.
  const env = loadEnv(mode, path.resolve(import.meta.dirname), "");
  for (const key of [
    "GOOGLE_MAPS_API_KEY",
    "VITE_GOOGLE_MAPS_API_KEY",
    "BUILT_IN_FORGE_API_URL",
    "BUILT_IN_FORGE_API_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM",
    "LEAD_TO",
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (!process.env[key] && env[key]) {
      process.env[key] = env[key];
    }
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    envDir: path.resolve(import.meta.dirname),
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      // Stay on 3000 (fail loudly if it's busy) instead of silently moving to 3001+.
      // The Google Maps key is restricted to localhost:3000, so a drifting port breaks the map.
      strictPort: true,
      host: true,
      allowedHosts: [
        ".manuspre.computer",
        ".manus.computer",
        ".manus-asia.computer",
        ".manuscomputer.ai",
        ".manusvm.computer",
        "localhost",
        "127.0.0.1",
      ],
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
