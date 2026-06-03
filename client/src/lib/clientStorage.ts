import type { ClientRecord } from "@/types/clients";

const CLIENTS_KEY = "junk_estimator_clients_v1";

const now = "2026-06-01T18:45:00.000Z";

const defaultClients: ClientRecord[] = [
  {
    id: "client-abel-morales",
    kind: "client",
    firstName: "Abel",
    lastName: "Morales",
    company: "Saguaro Transport",
    email: "abel.morales196487@gmail.com",
    phone: "(626) 559-1923",
    smsSetting: "receive",
    streetAddress: "13809 Barrydale St",
    city: "West Puente Valley",
    state: "CA",
    zip: "91746",
    leadSource: "Referral",
    tags: ["autopilot"],
    privateNotes: "Autopilot #1 Fan.",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "client-jane-doe",
    kind: "client",
    firstName: "Jane",
    lastName: "Doe",
    company: "Example Inc.",
    email: "jane.doe@example.com",
    smsSetting: "receive",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "client-john-doe",
    kind: "client",
    firstName: "John",
    lastName: "Doe",
    company: "Example Inc.",
    email: "john.doe@example.com",
    smsSetting: "receive",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "client-sam-doe",
    kind: "client",
    firstName: "Sam",
    lastName: "Doe",
    email: "sam.doe@example.com",
    smsSetting: "receive",
    createdAt: now,
    updatedAt: now,
  },
];

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

function readClients() {
  if (!canUseLocalStorage()) return defaultClients;
  try {
    const raw = window.localStorage.getItem(CLIENTS_KEY);
    return raw ? (JSON.parse(raw) as ClientRecord[]) : defaultClients;
  } catch {
    return defaultClients;
  }
}

function writeClients(clients: ClientRecord[]) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
  window.dispatchEvent(new Event("clients-updated"));
}

function clientId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `client-${Date.now()}`;
}

export function getClients(): ClientRecord[] {
  return readClients().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getClient(clientIdToFind: string): ClientRecord | null {
  return getClients().find((client) => client.id === clientIdToFind) ?? null;
}

export function saveClient(client: Partial<ClientRecord> & Pick<ClientRecord, "firstName" | "lastName" | "kind">): ClientRecord {
  const current = readClients();
  const saved: ClientRecord = {
    smsSetting: "receive",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...client,
    id: client.id || clientId(),
    tags: client.tags ?? [],
  };
  writeClients([saved, ...current.filter((item) => item.id !== saved.id)]);
  return saved;
}

export function deleteClient(clientIdToDelete: string): ClientRecord[] {
  const next = readClients().filter((client) => client.id !== clientIdToDelete);
  writeClients(next);
  return next;
}

export function clientName(client: Pick<ClientRecord, "firstName" | "lastName">) {
  return [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
}
