// Guard for the MCP connector (runs in `pnpm check`): code in mcp/ must act as
// the signed-in person, never with the master database key. Fails if any file
// there imports server/ or api/ code, or mentions the service-role key.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "mcp";
const forbidden = [
  // Our own server/ and api/ folders (relative paths), not package subpaths
  // like @modelcontextprotocol/sdk/server/mcp.js.
  [/(from|import\()\s*["']\.{1,2}\/(?:[^"']*\/)?(server|api)\//, "imports server/ or api/ code"],
  [/SERVICE_ROLE|service_role|serviceRole/i, "mentions the service-role (master) key"],
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.[cm]?[jt]sx?$/.test(name) ? [path] : [];
  });
}

const problems = [];
for (const file of files(root)) {
  const text = readFileSync(file, "utf8");
  for (const [pattern, why] of forbidden) if (pattern.test(text)) problems.push(`${file}: ${why}`);
}
if (problems.length) {
  console.error(`MCP guard failed — mcp/ must run as the signed-in person only:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`MCP guard OK (${files(root).length} files in ${root}/)`);
