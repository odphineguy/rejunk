import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use("/maps-proxy", async (req, res) => {
    const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!googleMapsKey) {
      console.warn("[Map] GOOGLE_MAPS_API_KEY missing in server env; maps proxy cannot load Google Maps.");
      res.status(500).type("text/plain").send("Maps proxy not configured. Set GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY.");
      return;
    }

    try {
      console.info("[Map] GOOGLE_MAPS_API_KEY present in server env; proxying Google Maps request.");
      const upstreamUrl = new URL(req.url, "https://maps.googleapis.com");
      upstreamUrl.searchParams.set("key", googleMapsKey);

      const upstreamResponse = await fetch(upstreamUrl);
      res.status(upstreamResponse.status);
      upstreamResponse.headers.forEach((value, key) => {
        if (!["content-encoding", "content-length", "transfer-encoding"].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });
      res.send(Buffer.from(await upstreamResponse.arrayBuffer()));
    } catch (error) {
      res.status(502).type("text/plain").send(`Maps proxy error: ${String(error)}`);
    }
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
