import { deleteEmployeeRemote, loadEmployeesRemote, upsertEmployeeRemote } from "@/lib/dataStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { EmployeeRecord } from "@/types/employees";

/**
 * Employees — Supabase-backed since the ticket redesign (phase 0, D3).
 *
 * Same pattern as clients/jobs: hydrate once at startup into an in-memory
 * cache, read synchronously, write cache + localStorage immediately and push
 * to the `app_employees` table in the background, then fire `employees-updated`.
 * localStorage is only a warm cache / offline fallback. The database is the
 * source of truth — an empty table means an empty Employees page (no demo seed).
 */

const EMPLOYEES_KEY = "junk_estimator_employees_v1";

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

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
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota (profile pictures are stored inline) — the in-memory cache still wins.
  }
}

function sortEmployees(employees: EmployeeRecord[]) {
  return [...employees].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function employeeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `employee-${Date.now()}`;
}

let cachedEmployees = sortEmployees(readJson<EmployeeRecord[]>(EMPLOYEES_KEY, []));

function persistLocal() {
  writeJson(EMPLOYEES_KEY, cachedEmployees);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("employees-updated"));
}

function reportRemoteError(context: string) {
  return (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[employeeStorage] Remote ${context} failed; local cache kept in sync.`, message);
  };
}

/**
 * Loads employees from Supabase into the in-memory cache. Called at startup by
 * the office bundle (drivers never read this table — their crew names arrive
 * resolved inside the `get_driver_today` payload).
 */
export async function hydrateEmployees(): Promise<void> {
  if (!isSupabaseConfigured) return;

  const remote = await loadEmployeesRemote().catch((error) => {
    reportRemoteError("employees load")(error);
    return null;
  });
  if (!remote) return; // unreachable — keep the local cache

  cachedEmployees = sortEmployees(remote);
  persistLocal();
}

export function getEmployees(): EmployeeRecord[] {
  return cachedEmployees;
}

export function getEmployee(employeeIdToFind: string): EmployeeRecord | null {
  return cachedEmployees.find((employee) => employee.id === employeeIdToFind) ?? null;
}

export function saveEmployee(employee: Partial<EmployeeRecord> & Pick<EmployeeRecord, "firstName" | "lastName" | "type">): EmployeeRecord {
  const existing = employee.id ? cachedEmployees.find((item) => item.id === employee.id) : undefined;
  const timestamp = new Date().toISOString();
  const saved: EmployeeRecord = {
    role: "Technician",
    fieldTech: true,
    locationTracking: "track",
    status: "active",
    profileColor: "green",
    ...existing,
    ...employee,
    id: employee.id || employeeId(),
    firstName: employee.firstName,
    lastName: employee.lastName,
    type: employee.type,
    createdAt: existing?.createdAt ?? employee.createdAt ?? timestamp,
    updatedAt: timestamp,
    attachments: employee.attachments ?? existing?.attachments ?? [],
  };
  cachedEmployees = sortEmployees([saved, ...cachedEmployees.filter((item) => item.id !== saved.id)]);
  persistLocal();
  void upsertEmployeeRemote(saved).catch(reportRemoteError("employee save"));
  return saved;
}

export function deleteEmployee(employeeIdToDelete: string): EmployeeRecord[] {
  cachedEmployees = cachedEmployees.filter((employee) => employee.id !== employeeIdToDelete);
  persistLocal();
  void deleteEmployeeRemote(employeeIdToDelete).catch(reportRemoteError("employee delete"));
  return cachedEmployees;
}

export function employeeName(employee: Pick<EmployeeRecord, "firstName" | "lastName">) {
  return [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
}

/** Display name for an employee id, or a short fallback when the id is unknown here. */
export function employeeNameById(employeeIdToFind: string | undefined, fallback = "Unknown"): string {
  if (!employeeIdToFind) return fallback;
  const employee = getEmployee(employeeIdToFind);
  return employee ? employeeName(employee) : fallback;
}

if (typeof window !== "undefined") {
  window.addEventListener("business-cache-reset", () => {
    cachedEmployees = [];
    window.dispatchEvent(new Event("employees-updated"));
  });
}
