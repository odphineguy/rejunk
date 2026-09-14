import { build } from "esbuild";
import vm from "node:vm";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const realRequire = createRequire(import.meta.url);
let role = "office";
let active = true;
const db = { from(table) {
  assert.ok(["staff", "staff_sessions"].includes(table), "Unauthorized path touched driver data");
  return { select() { return this; }, eq() { return this; }, async maybeSingle() {
    return { data: table === "staff_sessions"
      ? { staff_id: "test", expires_at: "2099-01-01" }
      : { id: "test", active, role, employee_id: "test" } };
  } };
} };
for (const file of ["server/driverAccess.ts", "api/driver/auth.ts", "api/driver/activate.ts"]) {
  const code = await build({ entryPoints: [file], bundle: true, platform: "node", format: "cjs", packages: "external", write: false });
  const module = { exports: {} };
  vm.runInNewContext(code.outputFiles[0].text, {
    module, exports: module.exports, console, Buffer, Date, Map, Set,
    process: { env: { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" } },
    require: name => name === "@supabase/supabase-js" ? { createClient: () => db } : realRequire(name),
  });
  async function invoke(body) {
    if (module.exports.handleDriverAction) return module.exports.handleDriverAction(body);
    const result = {};
    const res = { setHeader() {}, status(status) { result.status=status; return this; }, json(body) { result.body=body; return this; }, end() {} };
    await module.exports.default({ method: "POST", body, headers: {} }, res);
    return result;
  }
  for (const action of ["create-activation", "revoke"]) {
    role = "office"; active = true;
    const denied = await invoke({ action, staffToken: "s".repeat(64) });
    assert.ok([401,403].includes(denied.status), file + " must deny office");
    role = "owner";
    const permitted = await invoke({ action, staffToken: "s".repeat(64) });
    assert.equal(permitted.status,400,file + " owner should reach input validation");
    active = false;
    assert.ok([401,403].includes((await invoke({ action, staffToken: "s".repeat(64) })).status));
  }
}
console.log("PASS: shared and deployed driver management endpoints deny office/inactive identities; owners reach validation without writes or email");
