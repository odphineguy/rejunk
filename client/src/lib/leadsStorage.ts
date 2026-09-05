/**
 * Thumbtack leads for Clients & Leads (DASHBOARD_LEADS_SPEC §2, 2026-09-04).
 *
 * Read-only. Rows come from the `app_leads_v` view on rejunk-prod (one row
 * per Thumbtack negotiation) and conversations from `thumbtack_messages`.
 * The webhook pipeline owns those tables — the app never writes them, never
 * sends a Thumbtack reply, and never clears an escalation.
 *
 * Same shape as the other Supabase-backed caches: hydrate at startup into an
 * in-memory cache (localStorage warm copy), read synchronously, and listen
 * for `thumbtack-leads-updated`.
 */

import { ensureSession, isSupabaseConfigured, supabase } from "@/lib/supabase";
import { APP_TENANT_ID } from "@/lib/tenant";

const LEADS_KEY = "junk_estimator_thumbtack_leads_v1";
/** Clients & Leads shows the trailing window (spec acceptance: last 60 days). */
export const LEADS_WINDOW_DAYS = 60;

export type ThumbtackLeadStatus = "new" | "quoted" | "escalated" | "booked" | "lost";

export interface ThumbtackLead {
  negotiationId: string;
  leadId: string;
  name: string;
  phone: string | null;
  /** Thumbtack relay/masked number — not the customer's real line. */
  phoneIsRelay: boolean;
  email: string | null;
  category: string | null;
  city: string | null;
  state: string | null;
  receivedAt: string;
  status: ThumbtackLeadStatus;
  /** `lead` until booked, then `client`. */
  kind: "client" | "lead";
  bookedAt: string | null;
  bookedVia: string | null;
  hcpJobId: string | null;
  escalatedAt: string | null;
  tvInstallReferral: boolean;
  /** Thumbtack's charge for the lead, as stored (e.g. "$17.31"). */
  leadPrice: string | null;
  /** Last outbound message (truncated) — the quote as sent. */
  quotedText: string | null;
  lastMessageAt: string | null;
  /** Negotiations sharing this phone number (1 = first-time). */
  leadCountForPhone: number;
  firstResponseLatencyMs: number | null;
}

export interface ThumbtackMessage {
  id: string;
  direction: "inbound" | "outbound";
  fromType: string | null;
  text: string;
  sentAt: string | null;
}

const canUseLocalStorage = () =>
  typeof window !== "undefined" && Boolean(window.localStorage);

function readJson<T>(key: string, fallback: T): T {
  if (!canUseLocalStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

let cachedLeads: ThumbtackLead[] = readJson<ThumbtackLead[]>(LEADS_KEY, []);
let hydrated = false;

function notify() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("thumbtack-leads-updated"));
}

const STATUSES: ThumbtackLeadStatus[] = ["new", "quoted", "escalated", "booked", "lost"];

function leadFromRow(row: Record<string, unknown>): ThumbtackLead {
  const status = String(row.status ?? "new") as ThumbtackLeadStatus;
  return {
    negotiationId: String(row.negotiation_id),
    leadId: String(row.lead_id),
    name: String(row.customer_name ?? "").trim() || "Thumbtack customer",
    phone: (row.customer_phone as string | null) ?? null,
    phoneIsRelay: Boolean(row.phone_is_relay),
    email: (row.customer_email as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    receivedAt: String(row.received_at),
    status: STATUSES.includes(status) ? status : "new",
    kind: row.kind === "client" ? "client" : "lead",
    bookedAt: (row.booked_at as string | null) ?? null,
    bookedVia: (row.booked_via as string | null) ?? null,
    hcpJobId: (row.hcp_job_id as string | null) ?? null,
    escalatedAt: (row.escalated_at as string | null) ?? null,
    tvInstallReferral: Boolean(row.tv_install_referral),
    leadPrice: (row.lead_price as string | null) || null,
    quotedText: (row.last_outbound_text as string | null) ?? null,
    lastMessageAt: (row.last_message_at as string | null) ?? null,
    leadCountForPhone: Number(row.lead_count_for_phone ?? 1) || 1,
    firstResponseLatencyMs:
      row.first_response_latency_ms == null
        ? null
        : Number(row.first_response_latency_ms),
  };
}

/**
 * Loads the trailing window of Thumbtack leads into the cache. Called at
 * startup with the other hydrators; safe to call again to refresh.
 */
export async function hydrateThumbtackLeads(
  days: number = LEADS_WINDOW_DAYS
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  if (!(await ensureSession())) return;

  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from("app_leads_v")
    .select("*")
    .eq("tenant_id", APP_TENANT_ID)
    .gte("received_at", since)
    .order("received_at", { ascending: false });
  if (error) {
    console.error("[leadsStorage] Thumbtack leads load failed; cache kept.", error.message);
    return;
  }
  cachedLeads = (data ?? []).map(row => leadFromRow(row as Record<string, unknown>));
  hydrated = true;
  writeJson(LEADS_KEY, cachedLeads);
  notify();
}

export function getThumbtackLeads(): ThumbtackLead[] {
  return cachedLeads;
}

export function getThumbtackLead(negotiationId: string): ThumbtackLead | null {
  return cachedLeads.find(lead => lead.negotiationId === negotiationId) ?? null;
}

/** True once the live view has been read at least once this session. */
export function thumbtackLeadsHydrated(): boolean {
  return hydrated;
}

/** The full thread for one negotiation, oldest first (read-only). */
export async function loadConversation(
  negotiationId: string
): Promise<ThumbtackMessage[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  if (!(await ensureSession())) return [];
  const { data, error } = await supabase
    .from("thumbtack_messages")
    .select("id, direction, from_type, text, sent_at, created_at")
    .eq("tenant_id", APP_TENANT_ID)
    .eq("negotiation_id", negotiationId)
    .order("sent_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[leadsStorage] Conversation load failed.", error.message);
    throw new Error(error.message);
  }
  return (data ?? []).map(row => ({
    id: row.id,
    direction: row.direction === "inbound" ? "inbound" : "outbound",
    fromType: row.from_type,
    text: row.text,
    sentAt: row.sent_at ?? row.created_at,
  }));
}

// ---------- export ----------

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function thumbtackLeadsToCsv(leads: ThumbtackLead[]): string {
  const header = [
    "Type",
    "Name",
    "Phone",
    "Phone is relay",
    "Email",
    "Category",
    "City",
    "State",
    "Received",
    "Status",
    "Escalated",
    "Booked",
    "Booked via",
    "HCP job",
    "Last message",
    "Quote (last outbound)",
    "Lead cost",
    "Repeat count",
    "TV install referral",
    "Negotiation ID",
  ];
  const rows = leads.map(lead => [
    lead.kind === "client" ? "Client" : "Lead",
    lead.name,
    lead.phone,
    lead.phoneIsRelay ? "yes" : "no",
    lead.email,
    lead.category,
    lead.city,
    lead.state,
    lead.receivedAt,
    lead.status,
    lead.escalatedAt,
    lead.bookedAt,
    lead.bookedVia,
    lead.hcpJobId,
    lead.lastMessageAt,
    lead.quotedText,
    lead.leadPrice,
    lead.leadCountForPhone,
    lead.tvInstallReferral ? "yes" : "no",
    lead.negotiationId,
  ]);
  return [header, ...rows].map(row => row.map(csvEscape).join(",")).join("\r\n");
}

export function downloadThumbtackLeadsCsv(leads: ThumbtackLead[]): void {
  const blob = new Blob([thumbtackLeadsToCsv(leads)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `thumbtack-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
