import type { EmployeeRecord } from "@/types/employees";

const EMPLOYEES_KEY = "junk_estimator_employees_v1";

const now = "2026-06-01T18:45:00.000Z";

const defaultEmployees: EmployeeRecord[] = [
  {
    id: "employee-abel-morales",
    firstName: "Abel",
    lastName: "Morales",
    email: "abel.morales196487@gmail.com",
    phone: "(626) 559-1923",
    type: "employee",
    role: "Owner",
    fieldTech: true,
    locationTracking: "track",
    status: "active",
    profileColor: "red",
    attachments: [],
    createdAt: now,
    updatedAt: now,
  },
];

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

function readEmployees() {
  if (!canUseLocalStorage()) return defaultEmployees;
  try {
    const raw = window.localStorage.getItem(EMPLOYEES_KEY);
    return raw ? (JSON.parse(raw) as EmployeeRecord[]) : defaultEmployees;
  } catch {
    return defaultEmployees;
  }
}

function writeEmployees(employees: EmployeeRecord[]) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(employees));
  window.dispatchEvent(new Event("employees-updated"));
}

function employeeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `employee-${Date.now()}`;
}

export function getEmployees(): EmployeeRecord[] {
  return readEmployees().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getEmployee(employeeIdToFind: string): EmployeeRecord | null {
  return getEmployees().find((employee) => employee.id === employeeIdToFind) ?? null;
}

export function saveEmployee(employee: Partial<EmployeeRecord> & Pick<EmployeeRecord, "firstName" | "lastName" | "type">): EmployeeRecord {
  const current = readEmployees();
  const existing = employee.id ? current.find((item) => item.id === employee.id) : undefined;
  const timestamp = new Date().toISOString();
  const saved: EmployeeRecord = {
    role: "Technician",
    fieldTech: true,
    locationTracking: "track",
    status: "active",
    profileColor: "red",
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
  writeEmployees([saved, ...current.filter((item) => item.id !== saved.id)]);
  return saved;
}

export function deleteEmployee(employeeIdToDelete: string): EmployeeRecord[] {
  const next = readEmployees().filter((employee) => employee.id !== employeeIdToDelete);
  writeEmployees(next);
  return next;
}

export function employeeName(employee: Pick<EmployeeRecord, "firstName" | "lastName">) {
  return [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
}
