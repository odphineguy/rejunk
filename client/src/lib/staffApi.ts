/**
 * Thin browser client for the office-access server endpoint (/api/staff).
 *
 * The staff / staff_sessions tables are locked down (server-only), so all
 * office login + access management goes through this single POST endpoint.
 * Backed by: the Vercel function api/staff.ts (production), the Express route
 * (pnpm start), and the Vite dev middleware (pnpm dev).
 */

export type StaffAction =
  | "login"
  | "validate"
  | "logout"
  | "grant"
  | "revoke"
  | "list"
  | "contacts"
  | "update-pin"
  | "update-email";

export interface StaffApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
}

export async function postStaff<T = Record<string, unknown>>(
  action: StaffAction,
  params: Record<string, unknown> = {}
): Promise<StaffApiResult<T>> {
  try {
    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...params }),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : data?.error || "Something went wrong.",
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: {} as T,
      error: "Can't reach the server right now. Check your connection and try again.",
    };
  }
}
