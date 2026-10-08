// Company isolation test (MCP connector Phase 1, step 4).
//
// Proves that a signed-in person of one company cannot see, change or delete
// another company's data — through the database rules (browser path, real
// sign-in), file storage, and the master-key server functions (/api/staff,
// /api/quote, /api/driver/auth, invoice payments).
//
// Pairs tested (viewer → other company):
//   WellSentry → Progressive, Progressive → WellSentry,
//   Test Company B (created for the run) → Progressive, Progressive → B.
//
// Runs against the real rejunk-prod project. It creates temporary test logins
// (emails isolation-test-…@example.invalid, no usable PIN), one temporary
// company, and a few marked rows (ids starting ZZ-ISO-), and deletes all of
// them at the end, even if a check fails. It never edits real rows: every
// cross-company write is expected to be refused, and the real row is
// re-read afterwards to prove it.
//
// Usage: node --env-file=.env --import tsx scripts/security/test-tenant-isolation.mjs
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { handleStaffAction } from "../../server/staffAccess.ts";
import { handleOfficeQuote } from "../../server/officeQuote.ts";
import { handleDriverAction } from "../../server/driverAccess.ts";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_ANON_KEY.");
  process.exit(2);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const runId = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;

// Tables with a tenant_id the app or pipeline uses. Every row a viewer can
// read must belong to the viewer's own company.
const TABLES = [
  "agent_replies", "agent_sessions", "app_client_meta", "app_contact_overrides", "app_employees",
  "app_invoices", "app_payments", "app_settings", "bookings", "capacity_resources", "clients",
  "customer_notifications", "customers", "dispatch_messages", "dispatch_thread_participants",
  "dispatch_threads", "driver_activations", "driver_location_history", "driver_sessions",
  "enrichment_events", "facilities", "hcp_appointments", "hcp_availability_cache", "hcp_events_raw",
  "hcp_links", "inbound_sms", "job_photos", "job_time_events", "jobs", "material_pricing_rules",
  "negotiation_job_map", "pipeline_alerts", "pricebook_categories", "pricebook_items",
  "pricing_defaults", "proxy_numbers", "reminders_sent", "review_requests_sent", "reviews_received",
  "saved_estimates", "sms_retries", "staff", "staff_sessions", "thumbtack_category_map",
  "thumbtack_leads", "thumbtack_messages", "thumbtack_outbox", "thumbtack_status_posts",
  "thumbtack_tokens", "vehicles", "voice_calls", "volume_benchmarks", "app_leads_v",
];
// Rows an attacker might try to change or delete: table → primary key.
const WRITE_TARGETS = { jobs: "id", clients: "id", pricebook_items: "id", app_settings: "id", thumbtack_leads: "id", app_invoices: "id" };
const BUSINESS_ROWS = ["jobs", "saved_estimates", "facilities", "vehicles", "material_pricing_rules",
  "volume_benchmarks", "pricing_defaults", "pricebook_items", "pricebook_categories", "app_leads_v"];

const results = [];
let pair = "";
const pass = (name, detail = "") => results.push({ pair, name, ok: true, detail });
const fail = (name, detail = "") => results.push({ pair, name, ok: false, detail });
const note = (name, detail = "") => results.push({ pair, name, ok: true, note: true, detail });
const check = (cond, name, detail) => (cond ? pass(name, detail) : fail(name, detail));

const cleanup = { authUsers: [], companies: [], rows: [] };
let testerCount = 0;

async function must(query, what) {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function companyBySlug(slug) {
  return must(admin.from("companies").select("id, slug, name").eq("slug", slug).single(), `company ${slug}`);
}

/** A temporary signed-in person of `company` with `role`, bound exactly like the app does. */
async function makeTester(company, role) {
  testerCount += 1;
  const email = `isolation-test-${runId}-${testerCount}-${role}@example.invalid`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw new Error(`create user: ${created.error.message}`);
  const userId = created.data.user.id;
  cleanup.authUsers.push(userId);
  const staff = await must(
    admin.from("staff").insert({
      full_name: `Isolation Test ${role}`, email, role, pin_hash: "isolation-test-no-pin",
      active: true, auth_user_id: userId, tenant_id: company.id,
    }).select("id").single(),
    "staff insert",
  );
  const token = randomBytes(32).toString("hex");
  await must(admin.from("staff_sessions").insert({
    token, staff_id: staff.id, auth_user_id: userId, tenant_id: company.id,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }), "staff session insert");

  // Real sign-in: one-time email code (generated, not mailed), then bind.
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const code = link.data?.properties?.email_otp;
  if (!code) throw new Error(`sign-in code: ${link.error?.message}`);
  const signed = await client.auth.verifyOtp({ email, token: code, type: "email" });
  if (signed.error) throw new Error(`sign-in: ${signed.error.message}`);
  const bound = await client.rpc("bind_business_identity", { staff_token: token });
  if (bound.error || bound.data !== true) throw new Error(`bind: ${bound.error?.message ?? bound.data}`);
  return { client, token, staffId: staff.id, email, company, role };
}

/** One real row id per write-target table belonging to `company` (admin read). */
async function sampleRows(company) {
  const out = {};
  for (const [table, pk] of Object.entries(WRITE_TARGETS)) {
    const { data } = await admin.from(table).select(`${pk}, tenant_id`).eq("tenant_id", company.id).limit(1);
    if (data?.[0]) out[table] = data[0][pk];
  }
  const photo = await admin.from("job_photos").select("storage_path").eq("tenant_id", company.id).limit(1);
  out.photoPath = photo.data?.[0]?.storage_path;
  const neg = await admin.from("thumbtack_messages").select("negotiation_id").eq("tenant_id", company.id).limit(1);
  out.negotiationId = neg.data?.[0]?.negotiation_id;
  const staff = await admin.from("staff").select("email").eq("tenant_id", company.id).not("email", "like", "isolation-test-%").limit(1);
  out.staffEmail = staff.data?.[0]?.email;
  const fac = await admin.from("facilities").select("id").eq("tenant_id", company.id).eq("is_active", true).limit(1);
  const veh = await admin.from("vehicles").select("id").eq("tenant_id", company.id).eq("is_active", true).limit(1);
  const mat = await admin.from("material_pricing_rules").select("id").eq("tenant_id", company.id).eq("is_active", true).limit(1);
  out.quoteIds = fac.data?.[0] && veh.data?.[0] && mat.data?.[0]
    ? { facilityId: fac.data[0].id, vehicleId: veh.data[0].id, materialId: mat.data[0].id } : null;
  return out;
}

async function rowSnapshot(table, pk, id) {
  const { data } = await admin.from(table).select("*").eq(pk, id).maybeSingle();
  return data ? JSON.stringify(data) : null;
}

/** If a refused write somehow went through, put the real row back exactly. */
async function restoreIfChanged(table, pk, id, before) {
  const after = await rowSnapshot(table, pk, id);
  if (before === null || before === after) return after;
  await admin.from(table).upsert(JSON.parse(before));
  console.error(`!! ${table} ${id} was changed by a cross-company write; restored from snapshot.`);
  return after;
}

async function runPair(viewerCompany, otherCompany) {
  pair = `${viewerCompany.slug} → ${otherCompany.slug}`;
  console.log(`\n=== ${pair} ===`);
  const owner = await makeTester(viewerCompany, "owner");
  const office = await makeTester(viewerCompany, "office");
  const other = await sampleRows(otherCompany);
  const db = owner.client;

  // 1. Reads: nothing of any other company is visible, on any table.
  const visible = {};
  for (const table of TABLES) {
    const foreign = await db.from(table).select("tenant_id", { count: "exact", head: true }).neq("tenant_id", viewerCompany.id);
    const own = await db.from(table).select("tenant_id", { count: "exact", head: true }).eq("tenant_id", viewerCompany.id);
    if (foreign.error) { pass(`read ${table}`, `no browser access (${foreign.error.code ?? foreign.error.message})`); continue; }
    visible[table] = own.error ? `error: ${own.error.message}` : own.count;
    check(foreign.count === 0, `read ${table}`, `other-company rows visible: ${foreign.count}; own: ${own.count}`);
  }
  for (const [table, id] of Object.entries(other)) {
    if (!WRITE_TARGETS[table]) continue;
    const { data } = await db.from(table).select(WRITE_TARGETS[table]).eq(WRITE_TARGETS[table], id);
    check(!data?.length, `read by id ${table}`, `asked for ${otherCompany.slug} row ${id}`);
  }

  // 2. Writes against the other company's real rows: refused, row unchanged.
  for (const [table, pk] of Object.entries(WRITE_TARGETS)) {
    const id = other[table];
    if (!id) { note(`write ${table}`, `${otherCompany.slug} has no ${table} row to target`); continue; }
    const before = await rowSnapshot(table, pk, id);
    await db.from(table).update({ tenant_id: viewerCompany.id }).eq(pk, id);
    await db.from(table).delete().eq(pk, id);
    const after = await restoreIfChanged(table, pk, id, before);
    check(before !== null && before === after, `update+delete ${table}`, `${otherCompany.slug} row ${id} ${before === after ? "unchanged" : "CHANGED OR DELETED"}`);
  }
  const forged = await db.from("jobs").insert({ id: `ZZ-ISO-${runId}-forged`, data: {}, tenant_id: otherCompany.id });
  cleanup.rows.push(["jobs", "id", `ZZ-ISO-${runId}-forged`]);
  check(Boolean(forged.error), "insert job into other company", forged.error?.message ?? "INSERTED");
  const ownJobId = `ZZ-ISO-${runId}-${testerCount}-own`;
  cleanup.rows.push(["jobs", "id", ownJobId]);
  const ownInsert = await db.from("jobs").insert({ id: ownJobId, data: {} });
  const ownRow = await admin.from("jobs").select("tenant_id").eq("id", ownJobId).maybeSingle();
  check(!ownInsert.error && ownRow.data?.tenant_id === viewerCompany.id, "own insert lands in own company",
    ownInsert.error?.message ?? `stamped ${ownRow.data?.tenant_id}`);

  // 3. Database functions that skip the table rules.
  for (const resource of BUSINESS_ROWS) {
    const { data, error } = await db.rpc("business_rows", { resource });
    if (error) { fail(`business_rows ${resource}`, error.message); continue; }
    const foreign = (data ?? []).filter((r) => r.tenant_id && r.tenant_id !== viewerCompany.id).length;
    check(foreign === 0, `business_rows ${resource}`, `${data.length} rows, other-company: ${foreign}`);
  }
  const otherDash = await db.rpc("dashboard_metrics", { p_tenant: otherCompany.slug, p_date: "2026-09-20" });
  check(Boolean(otherDash.error), "dashboard for other company", otherDash.error?.message ?? "RETURNED DATA");
  const otherDashId = await db.rpc("dashboard_metrics_series", { p_tenant: otherCompany.id, p_date: "2026-09-20", p_days: 2 });
  check(Boolean(otherDashId.error), "dashboard series for other company id", otherDashId.error?.message ?? "RETURNED DATA");
  const ownDash = await db.rpc("dashboard_metrics", { p_tenant: viewerCompany.slug, p_date: "2026-09-20" });
  check(!ownDash.error, "dashboard for own company", ownDash.error?.message ?? "ok");
  if (other.negotiationId) {
    const conv = await db.rpc("business_conversation", { negotiation: other.negotiationId });
    check(!conv.error && Array.isArray(conv.data) && conv.data.length === 0, "other company's Thumbtack thread",
      conv.error?.message ?? `${conv.data?.length} messages returned`);
  }
  if (other.jobs) {
    const time = await db.rpc("job_time_summary", { target_job_id: other.jobs });
    check(Boolean(time.error), "job time for other company's job", time.error?.message ?? "RETURNED DATA");
    const texts = await db.rpc("job_customer_notifications", { target_job_id: other.jobs });
    check(Boolean(texts.error), "customer texts for other company's job", texts.error?.message ?? "RETURNED DATA");
    const before = await rowSnapshot("jobs", "id", other.jobs);
    const save = await office.client.rpc("office_save_job", { value: { id: other.jobs, customerName: "ISOLATION TEST" } });
    await office.client.rpc("office_delete_record", { resource: "jobs", record_id: other.jobs });
    const after = await restoreIfChanged("jobs", "id", other.jobs, before);
    check(Boolean(save.error) && before === after, "office save/delete other company's job",
      `${save.error?.message ?? "SAVE ACCEPTED"}; row ${before === after ? "unchanged" : "CHANGED"}`);
  }

  // 4. Photo files.
  if (other.photoPath) {
    const signed = await db.storage.from("job-photos").createSignedUrl(other.photoPath, 60);
    check(Boolean(signed.error), "signed link to other company's photo", signed.error?.message ?? "LINK CREATED");
    const folder = other.photoPath.split("/")[0];
    const listed = await db.storage.from("job-photos").list(folder);
    check(!listed.data?.length, "list other company's photo folder", `${listed.data?.length ?? 0} files`);
  } else note("photos", `${otherCompany.slug} has no photos`);

  // 5. Master-key server functions, called with the viewer's own office token.
  const staffList = await handleStaffAction({ action: "list", token: owner.token });
  const listed = staffList.body.access ?? [];
  const listedRows = listed.length
    ? await must(admin.from("staff").select("id, tenant_id").in("id", listed.map((p) => p.staffId)), "listed staff")
    : [];
  check(staffList.status === 200 && listedRows.length === listed.length && listedRows.every((r) => r.tenant_id === viewerCompany.id),
    "/api/staff list", `${listed.length} logins, all own company: ${listedRows.every((r) => r.tenant_id === viewerCompany.id)}`);
  const contacts = await handleStaffAction({ action: "contacts", token: owner.token });
  const otherNegs = new Set((await must(admin.from("app_contact_overrides").select("negotiation_id").eq("tenant_id", otherCompany.id), "contacts")).map((r) => r.negotiation_id));
  const leaked = (contacts.body.contacts ?? []).filter((c) => otherNegs.has(c.negotiation_id)).length;
  check(contacts.status === 200 && leaked === 0, "/api/staff contacts", `${contacts.body.contacts?.length ?? 0} returned, other-company: ${leaked}`);
  if (other.staffEmail) {
    const before = await rowSnapshot("staff", "email", other.staffEmail);
    const grant = await handleStaffAction({ action: "grant", token: owner.token, email: other.staffEmail, fullName: "Isolation Takeover", role: "owner" });
    const revoke = await handleStaffAction({ action: "revoke", token: owner.token, email: other.staffEmail });
    const after = await restoreIfChanged("staff", "email", other.staffEmail, before);
    check(grant.status !== 200 && revoke.status !== 200 && before === after, "/api/staff grant/revoke other company's login",
      `grant ${grant.status}, revoke ${revoke.status}, row ${before === after ? "unchanged" : "CHANGED"}`);
  } else note("/api/staff grant/revoke", `${otherCompany.slug} has no real office login`);
  if (other.quoteIds) {
    const quote = await handleOfficeQuote({ token: owner.token, ...other.quoteIds, cubicYards: 4 });
    check(quote.status !== 200, "/api/quote with other company's trucks/dump/materials", `status ${quote.status} ${quote.body.error ?? ""}`);
  } else note("/api/quote", `${otherCompany.slug} has no pricing setup to borrow`);
  const own = await sampleRows(viewerCompany);
  if (own.quoteIds) {
    const quote = await handleOfficeQuote({ token: owner.token, ...own.quoteIds, cubicYards: 4 });
    check(quote.status === 200, "/api/quote with own setup still works", `status ${quote.status} ${quote.body.error ?? ""}`);
  }
  const otherEmployee = await admin.from("app_employees").select("id").eq("tenant_id", otherCompany.id).limit(1);
  const targetEmployee = otherEmployee.data?.[0]?.id ?? "00000000-0000-0000-0000-000000000000";
  const driverCountBefore = (await admin.from("driver_activations").select("id", { count: "exact", head: true }).eq("tenant_id", otherCompany.id)).count;
  const activation = await handleDriverAction({ action: "create-activation", staffToken: owner.token, employeeId: targetEmployee, employeeName: "Isolation", email: owner.email });
  await handleDriverAction({ action: "revoke", staffToken: owner.token, employeeId: targetEmployee });
  const driverCountAfter = (await admin.from("driver_activations").select("id", { count: "exact", head: true }).eq("tenant_id", otherCompany.id)).count;
  check(activation.status === 404 && driverCountBefore === driverCountAfter, "/api/driver/auth for other company's employee",
    `create ${activation.status} ${activation.body.error ?? ""}; their activations ${driverCountBefore}→${driverCountAfter}`);
  if (other.app_invoices) {
    try {
      const { invoicePayment } = await import("../../server/payments/service.ts");
      await invoicePayment({ token: owner.token, action: "refresh", invoiceId: other.app_invoices });
      fail("invoice payment on other company's invoice", "ACCEPTED");
    } catch (error) {
      const msg = String(error?.message ?? error);
      if (/STRIPE|Stripe is not configured|not configured/i.test(msg) && !/Invoice not found/.test(msg)) note("invoice payment", `skipped locally: ${msg}`);
      else check(/Invoice not found for this company/.test(msg), "invoice payment on other company's invoice", msg);
    }
  }

  // 6. Settings are one copy per (company, name): a second company saving
  // "calendar" gets its own row and never touches the first company's.
  // (Skipped for Progressive's tester — that would be a real own-company save.)
  const calendar = await admin.from("app_settings").select("*").eq("key", "calendar").neq("tenant_id", viewerCompany.id).limit(1).maybeSingle();
  if (viewerCompany.slug !== "progressive" && calendar.data) {
    const before = JSON.stringify(calendar.data);
    const setting = await db.from("app_settings").upsert({ key: "calendar", value: { isolationTest: runId } }, { onConflict: "tenant_id,key" }).select("id, tenant_id").maybeSingle();
    if (setting.data?.id) cleanup.rows.push(["app_settings", "id", setting.data.id]);
    const after = await restoreIfChanged("app_settings", "id", calendar.data.id, before);
    check(before === after, "settings save can't overwrite another company's", setting.error ? `refused: ${setting.error.message}` : "accepted");
    check(!setting.error && setting.data?.tenant_id === viewerCompany.id, "company can save its own copy of a setting another company has", setting.error?.message ?? `saved under ${setting.data?.tenant_id}`);
  }
  console.log(`own rows visible: ${JSON.stringify(visible)}`);
}

async function removeTestData() {
  for (const [table, pk, id] of cleanup.rows) await admin.from(table).delete().eq(pk, id);
  const testStaff = await admin.from("staff").select("id").like("email", `isolation-test-${runId}-%`);
  const ids = (testStaff.data ?? []).map((r) => r.id);
  if (ids.length) {
    await admin.from("staff_sessions").delete().in("staff_id", ids);
    await admin.from("staff").delete().in("id", ids);
  }
  for (const id of cleanup.authUsers) {
    await admin.from("memberships").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  for (const id of cleanup.companies) await admin.from("companies").delete().eq("id", id);
  const leftovers = await admin.from("staff").select("id", { count: "exact", head: true }).like("email", "isolation-test-%");
  const leftJobs = await admin.from("jobs").select("id", { count: "exact", head: true }).like("id", "ZZ-ISO-%");
  console.log(`\ncleanup: test logins left ${leftovers.count}, test jobs left ${leftJobs.count}`);
  return (leftovers.count ?? 0) + (leftJobs.count ?? 0);
}

let crashed = null;
try {
  const progressive = await companyBySlug("progressive");
  const wellsentry = await companyBySlug("wellsentry");
  const companyB = await must(
    admin.from("companies").insert({ slug: `isolation-test-${runId}`, name: "Isolation Test Company B" }).select("id, slug, name").single(),
    "create Company B",
  );
  cleanup.companies.push(companyB.id);
  // Give Company B one real-looking job so Progressive has something to try to reach.
  await must(admin.from("jobs").insert({ id: `ZZ-ISO-${runId}-b-job`, data: { customerName: "Isolation Test" }, tenant_id: companyB.id }), "seed B job");
  cleanup.rows.push(["jobs", "id", `ZZ-ISO-${runId}-b-job`]);

  await runPair(wellsentry, progressive);
  await runPair(progressive, wellsentry);
  await runPair(companyB, progressive);
  await runPair(progressive, companyB);
} catch (error) {
  crashed = error;
  console.error("\nTEST RUN STOPPED:", error.message);
} finally {
  const left = await removeTestData();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    if (!r.ok || r.note) console.log(`${r.ok ? "NOTE" : "FAIL"}  [${r.pair}] ${r.name} — ${r.detail}`);
  }
  console.log(`\n${results.filter((r) => r.ok && !r.note).length} passed, ${failed.length} failed, ${results.filter((r) => r.note).length} notes`);
  process.exit(crashed || failed.length || left ? 1 : 0);
}
