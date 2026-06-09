/**
 * Manager-side driver activation operations (Employees page + Dispatch Center).
 *
 * The activation row is created directly in Supabase from the browser (same
 * direct-to-DB pattern as the rest of the app); only the email send goes
 * through the backend (`POST /api/driver/activate`). If the email endpoint is
 * unreachable (e.g. static Vercel deploy without the function), callers get
 * `emailSent: false` plus the key and link so the manager can text it instead.
 */

import { generateActivationKey } from "@/lib/driverAuth";
import { employeeName } from "@/lib/employeeStorage";
import { ensureSession, supabase } from "@/lib/supabase";
import type { EmployeeRecord } from "@/types/employees";
import type { DriverActivation, DriverAppStatus, DriverSession } from "@/types/driver";

export const ACTIVATION_EXPIRY_HOURS = 72;
/** Dispatch treats anything not seen in 5 minutes as offline, whatever the flag says. */
export const DRIVER_OFFLINE_AFTER_MS = 5 * 60 * 1000;

export interface ActivateDriverResult {
  activation: DriverActivation;
  emailSent: boolean;
  emailError?: string;
  activationLink: string;
}

type ActivationRow = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  activation_key: string;
  email_sent_to: string | null;
  status: string;
  expires_at: string;
  activated_at: string | null;
  created_by: string | null;
  created_at: string;
};

type SessionRow = {
  id: string;
  employee_id: string;
  activation_id: string | null;
  display_name: string | null;
  last_seen_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_heading: number | null;
  is_online: boolean;
  session_token?: string | null;
  created_at: string;
};

export function mapActivationRow(row: ActivationRow): DriverActivation {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name ?? undefined,
    activationKey: row.activation_key,
    emailSentTo: row.email_sent_to ?? undefined,
    status: row.status as DriverActivation["status"],
    expiresAt: row.expires_at,
    activatedAt: row.activated_at ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

export function mapSessionRow(row: SessionRow): DriverSession {
  return {
    id: row.id,
    employeeId: row.employee_id,
    activationId: row.activation_id ?? undefined,
    displayName: row.display_name ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
    lastLat: row.last_lat ?? undefined,
    lastLng: row.last_lng ?? undefined,
    lastHeading: row.last_heading ?? undefined,
    isOnline: row.is_online,
    createdAt: row.created_at,
  };
}

export function activationLink(activationKey: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://rejunk.vercel.app";
  return `${origin}/driver/activate?key=${encodeURIComponent(activationKey)}`;
}

export function isActivationExpired(activation: DriverActivation) {
  return activation.status === "expired" || (activation.status === "pending" && new Date(activation.expiresAt).getTime() < Date.now());
}

export function isSessionLive(session: DriverSession | null): boolean {
  if (!session?.lastSeenAt) return false;
  return session.isOnline && Date.now() - new Date(session.lastSeenAt).getTime() < DRIVER_OFFLINE_AFTER_MS;
}

/** Latest activation + latest session per employee, for the Mobile App column. */
export async function fetchDriverAppStatuses(): Promise<Record<string, DriverAppStatus>> {
  if (!supabase || !(await ensureSession())) return {};

  const [activations, sessions] = await Promise.all([
    supabase
      .from("driver_activations")
      .select("id, employee_id, employee_name, activation_key, email_sent_to, status, expires_at, activated_at, created_by, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("driver_sessions")
      .select("id, employee_id, activation_id, display_name, last_seen_at, last_lat, last_lng, last_heading, is_online, created_at")
      .not("session_token", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  const statuses: Record<string, DriverAppStatus> = {};
  for (const row of (activations.data ?? []) as ActivationRow[]) {
    statuses[row.employee_id] ??= { activation: null, session: null };
    statuses[row.employee_id].activation ??= mapActivationRow(row);
  }
  for (const row of (sessions.data ?? []) as SessionRow[]) {
    statuses[row.employee_id] ??= { activation: null, session: null };
    statuses[row.employee_id].session ??= mapSessionRow(row);
  }
  return statuses;
}

/** Online drivers (plus anyone seen within the last hour) for the dispatch map. */
export async function fetchLiveDriverSessions(): Promise<DriverSession[]> {
  if (!supabase || !(await ensureSession())) return [];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("driver_sessions")
    .select("id, employee_id, activation_id, display_name, last_seen_at, last_lat, last_lng, last_heading, is_online, created_at")
    .not("session_token", "is", null)
    .or(`is_online.eq.true,last_seen_at.gte.${oneHourAgo}`)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  // One marker per driver: keep the freshest session per employee.
  const byEmployee = new Map<string, DriverSession>();
  for (const row of data as SessionRow[]) {
    if (!byEmployee.has(row.employee_id)) byEmployee.set(row.employee_id, mapSessionRow(row));
  }
  return Array.from(byEmployee.values());
}

/**
 * Creates a fresh activation for the employee (revoking any earlier one) and
 * asks the backend to email the key. Throws only when the activation row
 * itself can't be created — email failure is reported, not thrown.
 */
export async function activateDriver(employee: EmployeeRecord, options?: { createdBy?: string }): Promise<ActivateDriverResult> {
  if (!employee.email) throw new Error("This employee has no email on file. Add one first.");
  if (employee.type === "subcontractor") throw new Error("Subcontractors don't get app access — they get SMS only.");
  if (!supabase || !(await ensureSession())) {
    throw new Error("The backend isn't connected, so activations can't be created right now.");
  }

  // A resend invalidates everything that came before it.
  await revokeDriverAccess(employee.id, { silent: true });

  const activationKey = generateActivationKey();
  const expiresAt = new Date(Date.now() + ACTIVATION_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("driver_activations")
    .insert({
      employee_id: employee.id,
      employee_name: employeeName(employee),
      activation_key: activationKey,
      email_sent_to: employee.email,
      status: "pending",
      expires_at: expiresAt,
      created_by: options?.createdBy ?? null,
    })
    .select("id, employee_id, employee_name, activation_key, email_sent_to, status, expires_at, activated_at, created_by, created_at")
    .single();
  if (error || !data) throw new Error("Couldn't create the activation. Try again.");

  const activation = mapActivationRow(data as ActivationRow);
  const link = activationLink(activationKey);
  let emailSent = false;
  let emailError: string | undefined;
  try {
    const response = await fetch("/api/driver/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: employee.id,
        email: employee.email,
        activationKey,
        employeeName: employeeName(employee),
        activationLink: link,
        expiresAt,
      }),
    });
    if (response.ok) {
      emailSent = true;
    } else {
      const body = await response.json().catch(() => null);
      emailError = (body as { error?: string } | null)?.error ?? `Email service answered ${response.status}.`;
    }
  } catch {
    emailError = "The email service couldn't be reached.";
  }

  window.dispatchEvent(new Event("driver-activations-updated"));
  return { activation, emailSent, emailError, activationLink: link };
}

/** Kills the driver's session token and marks their activations revoked. */
export async function revokeDriverAccess(employeeId: string, options?: { silent?: boolean }) {
  if (!supabase || !(await ensureSession())) {
    throw new Error("The backend isn't connected, so access can't be changed right now.");
  }
  await Promise.all([
    supabase
      .from("driver_activations")
      .update({ status: "revoked" })
      .eq("employee_id", employeeId)
      .in("status", ["pending", "activated"]),
    supabase
      .from("driver_sessions")
      .update({ session_token: null, is_online: false })
      .eq("employee_id", employeeId),
  ]);
  if (!options?.silent) window.dispatchEvent(new Event("driver-activations-updated"));
}
