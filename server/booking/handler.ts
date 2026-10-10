/**
 * POST /api/book — the public online-booking endpoint (ONLINE_BOOKING_SPEC).
 *
 * Actions:
 *  - `options`       → is booking on, which services, deposit amount
 *  - `availability`  → open arrival windows for one service, next 45 days
 *  - `book`          → re-checks the window, then writes the client, the
 *                      ticket (status scheduled) and an invoice, alerts the
 *                      office (email + text) and the customer, and returns a
 *                      Stripe Checkout URL for the $50 deposit
 *  - `deposit`       → re-opens the deposit checkout for a booking (`ref`)
 *
 * Runs with the service-role key; the public page never touches tables. The
 * site's company comes from SITE_COMPANY_SLUG only, never from the request.
 * Shared by the Vite dev middleware and the generated Vercel function
 * api/book.js (scripts/security/build-booking-api.mjs) — one source.
 *
 * Deposit: server/booking/deposit.ts (Stripe, same ledger + webhook as invoice
 * payment links). Without Stripe settings the booking still completes and the
 * office collects the deposit with "Record payment received".
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import {
  BOOKING_DAYS_AHEAD,
  BOOKING_DEPOSIT,
  BOOKING_REFUND_HOURS,
  BOOKING_SERVICES,
  BOOKING_WINDOWS,
  FULL_DAY_BLOCK_END,
  bookingDateLabel,
  bookingServiceById,
  inServiceArea,
  phoenixIso,
  priceBooking,
  type BookingService,
} from "../../shared/bookingCatalog";
import {
  leadHoursFrom,
  occupancyFromHcp,
  occupancyFromJob,
  phoenixDate,
  windowsForDay,
  type AvailabilityRules,
  type Occupancy,
} from "./availability";
import { cardDepositConfigured, depositCheckout } from "./deposit";

const BRAND = "Progressive Transportation Services";
const PHONE_DISPLAY = "(480) 351-0291";
const DEFAULT_ALERT_TO = "abe@saguarotransport.com";
const BOX_TRUCK = { vehicleId: "box-01", vehicleName: "BOX-01 · 2022 IHC MV607 26-ft Box Truck" };

export interface BookingResult {
  status: number;
  body: Record<string, unknown>;
}

// ── Throttles (per warm instance — a backstop, not the only guard) ──────────

const hits = new Map<string, { count: number; resetAt: number }>();
function limited(bucket: string, ip: string, max: number, windowMs: number): boolean {
  const key = `${bucket}:${ip || "unknown"}`;
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

// ── Context: database, company, settings ────────────────────────────────────

interface BookingSettings {
  enabled: boolean;
  allowSameDay: boolean;
  leadHours: number;
  /** null = every catalog service. */
  bookableServiceIds: string[] | null;
}

interface Context {
  sb: SupabaseClient;
  companyId: string;
  settings: BookingSettings;
}

async function loadContext(): Promise<Context | BookingResult> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const slug = (process.env.SITE_COMPANY_SLUG ?? "").trim();
  if (!url || !key || !slug) return unavailable();
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: company } = await sb.from("companies").select("id").eq("slug", slug).maybeSingle();
  if (!company) return unavailable();
  const { data: row } = await sb
    .from("app_settings")
    .select("value")
    .eq("tenant_id", company.id)
    .eq("key", "online-booking")
    .maybeSingle();
  const value = (row?.value ?? {}) as Record<string, unknown>;
  const nextDay = value.leadTime === "Next day";
  const ids = Array.isArray(value.bookableServiceIds)
    ? value.bookableServiceIds.filter((id): id is string => typeof id === "string")
    : null;
  return {
    sb,
    companyId: company.id as string,
    settings: {
      enabled: value.enabled !== false,
      allowSameDay: !nextDay && value.allowSameDay !== false,
      leadHours: leadHoursFrom(value.leadTime),
      bookableServiceIds: ids,
    },
  };
}

function unavailable(): BookingResult {
  return { status: 503, body: { error: `Online booking isn't available right now. Please call ${PHONE_DISPLAY}.` } };
}

function bookable(ctx: Context): BookingService[] {
  const ids = ctx.settings.bookableServiceIds;
  return BOOKING_SERVICES.filter(service => !ids || ids.includes(service.id));
}

function rules(ctx: Context, nowMs: number): AvailabilityRules {
  return { today: phoenixDate(nowMs), nowMs, allowSameDay: ctx.settings.allowSameDay, leadHours: ctx.settings.leadHours };
}

async function loadOccupancy(ctx: Context, from: string, to: string): Promise<Occupancy[]> {
  const fromIso = phoenixIso(from, "00:00");
  const toIso = new Date(Date.parse(phoenixIso(to, "00:00")) + 86400_000).toISOString();
  const [jobs, hcp, vehicles] = await Promise.all([
    ctx.sb
      .from("jobs")
      .select("id, status, scheduled_start, created_at, data")
      .eq("tenant_id", ctx.companyId)
      .gte("scheduled_start", fromIso)
      .lt("scheduled_start", toIso),
    ctx.sb
      .from("hcp_appointments")
      .select("id, scheduled_start, scheduled_end, resource, status, canceled, created_at")
      .eq("tenant_id", ctx.companyId)
      .gte("scheduled_start", fromIso)
      .lt("scheduled_start", toIso),
    ctx.sb.from("vehicles").select("id, vehicle_type"),
  ]);
  if (jobs.error || hcp.error) throw new Error(jobs.error?.message ?? hcp.error?.message);
  const types = new Map<string, string>(
    (vehicles.data ?? []).map((v: { id: string; vehicle_type: string }) => [v.id, v.vehicle_type])
  );
  const out: Occupancy[] = [];
  for (const row of jobs.data ?? []) {
    const o = occupancyFromJob(row, types);
    if (o) out.push(o);
  }
  for (const row of hcp.data ?? []) {
    const o = occupancyFromHcp(row);
    if (o) out.push(o);
  }
  return out;
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function options(ctx: Context): Promise<BookingResult> {
  return {
    status: 200,
    body: {
      enabled: ctx.settings.enabled,
      serviceIds: bookable(ctx).map(service => service.id),
      deposit: BOOKING_DEPOSIT,
      cardDeposit: cardDepositConfigured(),
      refundHours: BOOKING_REFUND_HOURS,
      phone: PHONE_DISPLAY,
    },
  };
}

async function availability(ctx: Context, body: Record<string, unknown>): Promise<BookingResult> {
  const service = bookable(ctx).find(s => s.id === body.serviceId);
  if (!service) return { status: 400, body: { error: "Choose a service first." } };
  const nowMs = Date.now();
  const r = rules(ctx, nowMs);
  const last = phoenixDate(nowMs, BOOKING_DAYS_AHEAD);
  const occupied = await loadOccupancy(ctx, r.today, last);
  const days = [];
  for (let i = 0; i <= BOOKING_DAYS_AHEAD; i++) {
    const date = phoenixDate(nowMs, i);
    const day = windowsForDay(service, date, occupied, r);
    days.push({ ...day, price: priceBooking(service, date, []).summary });
  }
  return { status: 200, body: { days } };
}

interface AddressInput {
  street: string;
  unit: string;
  city: string;
  zip: string;
  flights: number;
  elevator: boolean;
  access: string;
}

interface BookingInput {
  service: BookingService;
  date: string;
  window: (typeof BOOKING_WINDOWS)[number];
  addresses: AddressInput[];
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  smsConsent: boolean;
  isBot: boolean;
}

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function validateBooking(ctx: Context, body: Record<string, unknown>): BookingInput | string {
  const service = bookable(ctx).find(s => s.id === body.serviceId);
  if (!service) return "Choose a service.";
  const date = str(body.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Choose a date.";
  const window = BOOKING_WINDOWS.find(w => w.key === body.window);
  if (!window || (service.fullDay && window.key !== "am")) return "Choose an arrival window.";
  const rawAddresses = Array.isArray(body.addresses) ? body.addresses.slice(0, 2) : [];
  const needed = service.twoAddresses ? 2 : 1;
  if (rawAddresses.length !== needed) return "Enter the address details.";
  const addresses: AddressInput[] = [];
  for (const raw of rawAddresses) {
    const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const address = {
      street: str(a.street, 160),
      unit: str(a.unit, 40),
      city: str(a.city, 80),
      zip: str(a.zip, 5),
      flights: Math.max(0, Math.min(20, Math.floor(Number(a.flights) || 0))),
      elevator: a.elevator === true,
      access: str(a.access, 300),
    };
    if (!address.street || !address.city || !/^\d{5}$/.test(address.zip)) return "Enter a full street address, city and ZIP.";
    addresses.push(address);
  }
  if (!inServiceArea(addresses[0].zip)) return `That address is outside our online-booking area. Please call ${PHONE_DISPLAY}.`;
  const firstName = str(body.firstName, 60);
  const lastName = str(body.lastName, 60);
  const phone = str(body.phone, 20);
  const email = str(body.email, 200);
  if (!firstName || !lastName) return "Enter your first and last name.";
  if (!/^[\d\s()+.-]{7,20}$/.test(phone) || phone.replace(/\D/g, "").length < 10) return "Enter a phone number we can reach you at.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email.";
  return {
    service,
    date,
    window,
    addresses,
    firstName,
    lastName,
    phone,
    email,
    notes: str(body.notes, 2000),
    smsConsent: body.smsConsent === true,
    isBot: typeof body.company === "string" && body.company.trim().length > 0,
  };
}

async function nextJobNumber(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.from("jobs").select("job_number").order("created_at", { ascending: false }).limit(200);
  let max = 1000;
  for (const row of data ?? []) {
    const n = Number(String(row.job_number ?? "").replace(/\D/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `J-${max + 1}`;
}

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "").slice(-10);

function oneLine(a: AddressInput) {
  return `${a.street}${a.unit ? ` ${a.unit}` : ""}, ${a.city}, AZ ${a.zip}`;
}

function stairsText(a: AddressInput) {
  const stairs = a.flights === 0 ? "Ground floor / no stairs" : `${a.flights} flight${a.flights === 1 ? "" : "s"} of stairs`;
  return `${stairs}${a.elevator ? " · elevator" : ""}`;
}

/** Match an existing client by phone (then email); otherwise create one. */
async function upsertClient(ctx: Context, input: BookingInput, logText: string, nowIso: string): Promise<string> {
  const { data: rows } = await ctx.sb
    .from("clients")
    .select("id, phone, email")
    .eq("tenant_id", ctx.companyId)
    .limit(10000);
  const phone = digits(input.phone);
  const email = input.email.toLowerCase();
  const match =
    (rows ?? []).find(r => phone && digits(r.phone) === phone) ??
    (rows ?? []).find(r => email && (r.email ?? "").toLowerCase() === email);
  const logEntry = { id: randomUUID(), createdAt: nowIso, author: "Online booking", text: logText };
  if (match) {
    const { data: full } = await ctx.sb.from("clients").select("data").eq("id", match.id).maybeSingle();
    const data = (full?.data ?? {}) as Record<string, unknown>;
    const contactLog = Array.isArray(data.contactLog) ? data.contactLog : [];
    const { error } = await ctx.sb
      .from("clients")
      .update({
        kind: "client",
        data: { ...data, kind: "client", contactLog: [...contactLog, logEntry], updatedAt: nowIso },
      })
      .eq("id", match.id);
    if (error) throw new Error(`client update: ${error.message}`);
    return match.id as string;
  }
  const id = `website-booking-${randomUUID()}`;
  const first = input.addresses[0];
  const data = {
    id,
    kind: "client",
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    email: input.email,
    address: `${first.street}${first.unit ? ` ${first.unit}` : ""}`,
    city: first.city,
    state: "AZ",
    zip: first.zip,
    smsSetting: input.smsConsent ? "receive" : "do_not_receive",
    leadSource: "Website",
    tags: ["Website", "Online booking"],
    contactLog: [logEntry],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const { error } = await ctx.sb.from("clients").insert({
    id,
    tenant_id: ctx.companyId,
    created_by: null,
    kind: "client",
    first_name: input.firstName,
    last_name: input.lastName,
    company: null,
    email: input.email,
    phone: input.phone,
    data,
  });
  if (error) throw new Error(`client insert: ${error.message}`);
  return id;
}

async function createInvoice(
  ctx: Context,
  input: BookingInput,
  jobId: string,
  price: ReturnType<typeof priceBooking>,
  nowIso: string
): Promise<{ id: string; number: number } | null> {
  const id = `inv-${randomUUID()}`;
  const notes = [
    `Online booking — a $${BOOKING_DEPOSIT} deposit holds the appointment and is credited to this invoice.`,
    `Deposit refundable if cancelled at least ${BOOKING_REFUND_HOURS} hours before the appointment.`,
    price.hourly ? "Hourly work: the final amount is set by actual time on site." : "",
  ]
    .filter(Boolean)
    .join(" ");
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: top } = await ctx.sb
      .from("app_invoices")
      .select("invoice_number")
      .order("invoice_number", { ascending: false })
      .limit(1);
    const number = Number(top?.[0]?.invoice_number ?? 1000) + 1 + attempt;
    const invoice = {
      id,
      invoiceNumber: number,
      jobId,
      clientName: `${input.firstName} ${input.lastName}`,
      clientEmail: input.email,
      clientAddress: oneLine(input.addresses[0]),
      dueDate: input.date,
      createdAt: nowIso,
      total: price.total,
      amountDue: price.total,
      amountPaid: 0,
      // "sent" so the deposit card checkout can attach to it (drafts can't be collected).
      status: "sent",
      notes,
      items: price.lines.map(line => ({ id: randomUUID(), name: line.name, quantity: line.quantity, amount: line.amount })),
    };
    const { error } = await ctx.sb
      .from("app_invoices")
      .insert({ id, invoice_number: number, tenant_id: ctx.companyId, data: invoice });
    if (!error) return { id, number };
    if (error.code !== "23505") {
      console.error("[book] invoice insert failed:", error.message);
      return null;
    }
  }
  return null;
}

async function book(ctx: Context, body: Record<string, unknown>): Promise<BookingResult> {
  const input = validateBooking(ctx, body);
  if (typeof input === "string") return { status: 400, body: { error: input } };
  // Bots get a normal-looking answer and nothing is written.
  if (input.isBot) return { status: 200, body: { ok: true, jobNumber: "J-0000" } };

  const { service, date, window } = input;
  const nowMs = Date.now();
  const r = rules(ctx, nowMs);
  const slotTaken = (occupied: Occupancy[], ignoreRef?: string) =>
    !windowsForDay(service, date, occupied, r, ignoreRef).windows.find(w => w.key === window.key)?.open;
  if (slotTaken(await loadOccupancy(ctx, date, date))) {
    return { status: 409, body: { error: "Sorry — that arrival window was just taken. Please pick another time.", code: "taken" } };
  }

  const nowIso = new Date(nowMs).toISOString();
  const price = priceBooking(service, date, input.addresses.map(a => a.flights));
  const customerName = `${input.firstName} ${input.lastName}`;
  const scheduledStart = phoenixIso(date, window.start);
  const scheduledEnd = phoenixIso(date, service.fullDay ? FULL_DAY_BLOCK_END : window.blockEnd);
  const arrival = `${bookingDateLabel(date, true)}, ${window.label} (Arizona time)`;

  const clientId = await upsertClient(
    ctx,
    input,
    `Booked online: ${service.name} on ${arrival}. ${price.summary}${input.notes ? ` Notes: ${input.notes}` : ""}`,
    nowIso
  );

  const jobId = randomUUID();
  const jobNumber = await nextJobNumber(ctx.sb);
  const stopNames = service.twoAddresses ? ["Loading address", "Unloading address"] : ["Service address"];
  const stopTypes = service.twoAddresses ? ["pickup", "delivery"] : ["service"];
  const stops = input.addresses.map((a, index) => ({
    id: randomUUID(),
    jobId,
    stopOrder: index + 1,
    stopType: stopTypes[index],
    name: stopNames[index],
    address: `${a.street}${a.unit ? ` ${a.unit}` : ""}`,
    city: a.city,
    state: "AZ",
    zip: a.zip,
    contactName: customerName,
    contactPhone: input.phone,
    flights: a.flights,
    elevator: a.elevator,
    ...(a.access ? { instructions: a.access } : {}),
    ...(index === 0 ? { arrivalWindowStart: scheduledStart, arrivalWindowEnd: phoenixIso(date, window.end) } : {}),
    status: "pending",
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
  const data: Record<string, unknown> = {
    id: jobId,
    jobNumber,
    source: "website",
    createdAt: nowIso,
    updatedAt: nowIso,
    customerName,
    leadSource: "website",
    serviceType: service.serviceType,
    ...(service.movingKind ? { movingKind: service.movingKind } : {}),
    ...(service.deliveryKind ? { deliveryKind: service.deliveryKind } : {}),
    priority: "normal",
    requiredCrew: service.requiredCrew,
    crew: [],
    stops,
    items: [],
    dayType: price.dayType,
    quote: {
      tier: service.name,
      low: price.total,
      high: price.total,
      ...(service.includedHours ? { includedHours: service.includedHours } : {}),
      source: "booking",
    },
    paymentTerms: service.movingKind === "labor_only" ? "full_upfront" : "deposit",
    leadRef: { source: "website" },
    clientId,
    phone: input.phone,
    email: input.email,
    address: stops[0].address,
    city: stops[0].city,
    state: "AZ",
    zip: stops[0].zip,
    scheduledStart,
    scheduledEnd,
    ...(service.presetBoxTruck ? BOX_TRUCK : {}),
    status: "scheduled",
    paymentStatus: "unpaid",
    quotedAmount: price.total,
    notes: input.notes,
    internalNotes: [
      `Booked online ${new Date(nowMs).toLocaleString("en-US", { timeZone: "America/Phoenix" })}. Arrival ${window.label}.`,
      `Price shown to the customer: ${price.summary}`,
      `$${BOOKING_DEPOSIT} deposit: customer is sent to pay by card when card payments are on; if the invoice shows nothing paid, collect it and record it.`,
      input.smsConsent ? "Customer opted in to texts." : "Customer did NOT opt in to texts — call or email.",
    ].join("\n"),
    booking: {
      serviceId: service.id,
      window: window.key,
      priceLines: price.lines,
      smsConsent: input.smsConsent,
      bookedAt: nowIso,
    },
  };
  const { error: jobError } = await ctx.sb.from("jobs").insert({
    id: jobId,
    tenant_id: ctx.companyId,
    created_by: null,
    job_number: jobNumber,
    source: "website",
    customer_name: customerName,
    status: "scheduled",
    payment_status: "unpaid",
    scheduled_start: scheduledStart,
    quoted_amount: price.total,
    data,
  });
  if (jobError) throw new Error(`job insert: ${jobError.message}`);

  // Two people submitting the same window at the same moment both pass the
  // first check. Look again: if someone else's row landed first, back out.
  const after = await loadOccupancy(ctx, date, date);
  const mine = after.find(o => o.ref === `job:${jobId}`);
  const rival = after.find(
    o =>
      o.ref !== `job:${jobId}` &&
      o.date === date &&
      o.vehicleClass === service.vehicleClass &&
      ((service.fullDay && (o.am || o.pm)) || (!service.fullDay && o[window.key])) &&
      (!mine?.createdAt || !o.createdAt || o.createdAt < mine.createdAt || (o.createdAt === mine.createdAt && o.ref! < mine.ref!))
  );
  if (rival) {
    await ctx.sb.from("jobs").delete().eq("id", jobId);
    return { status: 409, body: { error: "Sorry — that arrival window was just taken. Please pick another time.", code: "taken" } };
  }

  const invoice = await createInvoice(ctx, input, jobId, price, nowIso);
  if (invoice) {
    await ctx.sb
      .from("jobs")
      .update({ data: { ...data, invoiceId: invoice.id } })
      .eq("id", jobId);
  }

  // Card deposit: send the customer to Stripe for $50. Any failure here keeps
  // the booking — the office collects the deposit instead.
  let checkoutUrl: string | null = null;
  if (invoice && cardDepositConfigured()) {
    try {
      const deposit = await depositCheckout({
        invoiceId: invoice.id,
        companyId: ctx.companyId,
        jobId,
        serviceName: service.name,
        customerEmail: input.email,
      });
      if ("url" in deposit) checkoutUrl = deposit.url;
    } catch (error) {
      console.error("[book] deposit checkout failed:", error instanceof Error ? error.message : error);
    }
  }

  const summary = { input, price, arrival, jobId, jobNumber, invoiceNumber: invoice?.number ?? null, cardDeposit: Boolean(checkoutUrl) };
  await Promise.allSettled([sendOfficeEmail(summary), sendOfficeText(summary), sendCustomerEmail(summary)]);

  return {
    status: 200,
    body: { ok: true, ref: jobId, jobNumber, arrival, priceSummary: price.summary, total: price.total, deposit: BOOKING_DEPOSIT, checkoutUrl },
  };
}

/** Re-open (or recreate) the $50 deposit checkout for a booking the customer just made. */
async function depositLink(ctx: Context, body: Record<string, unknown>): Promise<BookingResult> {
  const ref = str(body.ref, 64);
  if (!/^[0-9a-f-]{36}$/.test(ref)) return { status: 400, body: { error: "Booking not found." } };
  const { data: job } = await ctx.sb
    .from("jobs")
    .select("id, status, data")
    .eq("id", ref)
    .eq("tenant_id", ctx.companyId)
    .eq("source", "website")
    .maybeSingle();
  const data = (job?.data ?? {}) as Record<string, unknown>;
  if (!job || typeof data.invoiceId !== "string") return { status: 404, body: { error: "Booking not found." } };
  if (!cardDepositConfigured()) return { status: 503, body: { error: `Card payments are unavailable. Please call ${PHONE_DISPLAY}.` } };
  const result = await depositCheckout({
    invoiceId: data.invoiceId,
    companyId: ctx.companyId,
    jobId: job.id as string,
    serviceName: String((data.quote as { tier?: string } | undefined)?.tier ?? "Your booking"),
    customerEmail: typeof data.email === "string" ? data.email : undefined,
  });
  return { status: 200, body: "url" in result ? { checkoutUrl: result.url } : { paid: true } };
}

// ── Alerts ──────────────────────────────────────────────────────────────────

interface Summary {
  input: BookingInput;
  price: ReturnType<typeof priceBooking>;
  arrival: string;
  jobId: string;
  jobNumber: string;
  invoiceNumber: number | null;
  /** Customer was sent to Stripe to pay the deposit by card. */
  cardDeposit: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fromAddress(): string {
  const configured = process.env.RESEND_FROM ?? "";
  const address = configured.match(/<([^>]+)>/)?.[1] ?? (configured.includes("@") ? configured.trim() : "onboarding@resend.dev");
  return `${BRAND} <${address}>`;
}

function appUrl(path: string) {
  const base = (process.env.APP_BASE_URL || "https://rejunk.vercel.app").replace(/\/$/, "");
  return `${base}${path}`;
}

function detailRows(s: Summary): string {
  const { input, price } = s;
  const names = input.service.twoAddresses ? ["Loading", "Unloading"] : ["Address"];
  const rows: [string, string][] = [
    ["Service", input.service.name],
    ["Arrival", s.arrival],
    ...input.addresses.map((a, i): [string, string] => [
      names[i],
      `${oneLine(a)} — ${stairsText(a)}${a.access ? ` — ${a.access}` : ""}`,
    ]),
    ["Price", price.summary],
    ...price.lines.map((l): [string, string] => ["", `${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ""}: $${l.amount * l.quantity}`]),
  ];
  if (input.notes) rows.push(["Notes", input.notes]);
  return rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;font-weight:600;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:6px 0;color:#374151">${escapeHtml(v)}</td></tr>`
    )
    .join("");
}

function emailShell(title: string, inner: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f3;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1c1c">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:12px;border:1px solid #e2e6df;padding:28px 24px">
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(title)}</h1>${inner}</div>
<p style="text-align:center;font-size:12px;color:#8a917f;margin:16px 0 0">${BRAND} · ${PHONE_DISPLAY}</p></div></body></html>`;
}

async function sendOfficeEmail(s: Summary) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const { input } = s;
  const html = emailShell(
    `New online booking — ${s.jobNumber}`,
    `<div style="background:#f0f4ec;border-radius:10px;padding:16px;margin:0 0 16px">
<p style="margin:0 0 6px;font-size:16px;font-weight:700">${escapeHtml(`${input.firstName} ${input.lastName}`)}</p>
<p style="margin:0;font-size:15px"><a href="tel:${escapeHtml(input.phone)}" style="color:#155e3f;font-weight:600">${escapeHtml(input.phone)}</a></p>
<p style="margin:6px 0 0;font-size:14px"><a href="mailto:${escapeHtml(input.email)}" style="color:#155e3f">${escapeHtml(input.email)}</a></p></div>
<table style="width:100%;border-collapse:collapse;font-size:14px">${detailRows(s)}</table>
<p style="margin:16px 0 0;font-size:14px;font-weight:600;color:#9a6a00">${
    s.cardDeposit
      ? `Customer was sent to pay the $${BOOKING_DEPOSIT} deposit by card — it shows on invoice #${s.invoiceNumber} once paid. If it doesn't, collect it.`
      : `$${BOOKING_DEPOSIT} deposit not collected yet${s.invoiceNumber ? ` — record it on invoice #${s.invoiceNumber}` : ""}.`
  }</p>
<p style="margin:8px 0 0;font-size:13px;color:#5b6357">${input.smsConsent ? "✓ Opted in to texts" : "Did not opt in to texts — call or email"} · Crew and vehicle: assign in Dispatch Center.</p>
<p style="margin:16px 0 0"><a href="${appUrl(`/jobs/${s.jobId}`)}" style="color:#155e3f;font-weight:700">Open the ticket →</a></p>`
  );
  const { error } = await new Resend(apiKey).emails.send({
    from: fromAddress(),
    to: process.env.LEAD_TO || DEFAULT_ALERT_TO,
    subject: `New online booking — ${input.service.name} — ${s.arrival}`,
    html,
  });
  if (error) console.error("[book] office email failed:", error.message);
}

async function sendCustomerEmail(s: Summary) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const { input } = s;
  const html = emailShell(
    `You're booked, ${input.firstName}!`,
    `<p style="margin:0 0 16px;font-size:15px;color:#374151">Thanks for booking with ${BRAND}. Here are your details:</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${detailRows(s)}</table>
<div style="background:#f0f4ec;border-radius:10px;padding:16px;margin:16px 0 0;font-size:14px;color:#1c1c1c">
<p style="margin:0 0 6px;font-weight:700">Your $${BOOKING_DEPOSIT} deposit</p>
<p style="margin:0">${
    s.cardDeposit
      ? `Your $${BOOKING_DEPOSIT} deposit holds your appointment. If you didn't finish paying it, call or text us and we'll help.`
      : `We'll contact you shortly to collect a $${BOOKING_DEPOSIT} deposit that holds your appointment.`
  } It comes off your final bill, and it's fully refundable if you cancel at least ${BOOKING_REFUND_HOURS} hours before your appointment.</p></div>
<p style="margin:16px 0 0;font-size:14px;color:#374151">Need to change something? Call or text us at <a href="tel:+14803510291" style="color:#155e3f;font-weight:600">${PHONE_DISPLAY}</a>. Booking ${escapeHtml(s.jobNumber)}.</p>`
  );
  const { error } = await new Resend(apiKey).emails.send({
    from: fromAddress(),
    to: input.email,
    subject: `Booking confirmed — ${s.arrival}`,
    html,
  });
  if (error) console.error("[book] customer email failed:", error.message);
}

/** Text the owner(s) through the A2P number. Needs TWILIO_* + BOOKING_ALERT_PHONES. */
async function sendOfficeText(s: Summary) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const to = (process.env.BOOKING_ALERT_PHONES ?? "")
    .split(",")
    .map(p => p.trim())
    .filter(Boolean);
  if (!sid || !token || !from || !to.length) return;
  const { input } = s;
  const body = [
    `NEW ONLINE BOOKING ${s.jobNumber}`,
    `${input.firstName} ${input.lastName} ${input.phone}`,
    input.service.name,
    s.arrival,
    `${input.addresses[0].city}${input.addresses[1] ? ` → ${input.addresses[1].city}` : ""}`,
    s.price.summary,
    s.cardDeposit ? `Sent to pay $${BOOKING_DEPOSIT} deposit by card.` : `Collect $${BOOKING_DEPOSIT} deposit.`,
  ].join("\n");
  await Promise.allSettled(
    to.map(async phone => {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: phone, From: from, Body: body }).toString(),
      });
      if (!res.ok) console.error("[book] office text failed:", res.status, await res.text());
    })
  );
}

// ── Entry ───────────────────────────────────────────────────────────────────

export async function handleBooking(rawBody: unknown, ip: string): Promise<BookingResult> {
  const body = (rawBody && typeof rawBody === "object" ? rawBody : {}) as Record<string, unknown>;
  const action = body.action;
  if (action === "book") {
    if (limited("book", ip, 5, 15 * 60_000)) return { status: 429, body: { error: `Too many attempts. Please call ${PHONE_DISPLAY}.` } };
  } else if (limited("read", ip, 120, 5 * 60_000)) {
    return { status: 429, body: { error: "Too many requests. Please wait a minute." } };
  }
  const ctx = await loadContext();
  if ("status" in ctx) return ctx;
  if (action === "options") return options(ctx);
  if (!ctx.settings.enabled) return { status: 403, body: { error: `Online booking is off right now. Please call ${PHONE_DISPLAY}.` } };
  if (action === "availability") return availability(ctx, body);
  if (action === "book") return book(ctx, body);
  if (action === "deposit") return depositLink(ctx, body);
  return { status: 400, body: { error: "Unknown action." } };
}

export function clientIp(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket?.remoteAddress || "";
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  try {
    const result = await handleBooking(req.body, clientIp(req));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("[book] failed:", error instanceof Error ? error.message : error);
    return res.status(503).json({ error: `Something went wrong. Please call ${PHONE_DISPLAY}.` });
  }
}
