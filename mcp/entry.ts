// Vercel entry for /api/mcp (and /.well-known/oauth-protected-resource, via
// vercel.json). Bundled to api/mcp.js by scripts/security/build-mcp.mjs.
import { handleMcpRequest } from "./handler";
export const config = { api: { bodyParser: false } };
export default (req: any, res: any) => handleMcpRequest(req, res);
