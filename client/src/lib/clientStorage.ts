import {
  deleteClientRemote,
  loadClientsRemote,
  upsertClientRemote,
} from "@/lib/dataStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { ClientRecord, ContactLogEntry } from "@/types/clients";

const CLIENTS_KEY = "junk_estimator_clients_v1";
const CLIENTS_SEEDED_KEY = "junk_estimator_clients_seeded_v1";

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
    tags: ["rejunk"],
    privateNotes: "Rejunk #1 Fan.",
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

function sortClients(clients: ClientRecord[]) {
  return [...clients].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function clientId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `client-${Date.now()}`;
}

function noteId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `note-${Date.now()}`;
}

// Synchronous in-memory cache. Pages read this synchronously; Supabase reads
// happen through hydrateClients() and writes are fire-and-forget below.
// localStorage stays as an offline warm cache / fallback.
let cachedClients = sortClients(
  readJson<ClientRecord[]>(CLIENTS_KEY, defaultClients)
);

function persistLocal() {
  writeJson(CLIENTS_KEY, cachedClients);
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("clients-updated"));
}

function reportRemoteError(context: string) {
  return (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[clientStorage] Remote ${context} failed; local cache kept in sync.`,
      message
    );
  };
}

/**
 * Loads clients from Supabase into the in-memory cache. Call once at startup
 * BEFORE rendering so pages mount with shared data. Falls back to the
 * localStorage cache when Supabase is unconfigured/unreachable.
 *
 * First run against an empty database promotes the local demo clients to shared
 * data (one-time, guarded by a localStorage flag) so the Clients page isn't empty.
 */
export async function hydrateClients(): Promise<void> {
  if (!isSupabaseConfigured) return;

  const remote = await loadClientsRemote().catch(error => {
    reportRemoteError("clients load")(error);
    return null;
  });
  if (!remote) return; // unreachable — keep the local cache

  const alreadySeeded =
    canUseLocalStorage() &&
    window.localStorage.getItem(CLIENTS_SEEDED_KEY) === "1";

  if (remote.length === 0 && !alreadySeeded) {
    if (canUseLocalStorage())
      window.localStorage.setItem(CLIENTS_SEEDED_KEY, "1");
    cachedClients.forEach(
      client =>
        void upsertClientRemote(client).catch(reportRemoteError("clients seed"))
    );
  } else {
    cachedClients = sortClients(remote);
    writeJson(CLIENTS_KEY, cachedClients);
  }

  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("clients-updated"));
}

export function getClients(): ClientRecord[] {
  return cachedClients;
}

export function getClient(clientIdToFind: string): ClientRecord | null {
  return cachedClients.find(client => client.id === clientIdToFind) ?? null;
}

export function saveClient(
  client: Partial<ClientRecord> &
    Pick<ClientRecord, "firstName" | "lastName" | "kind">
): ClientRecord {
  const saved: ClientRecord = {
    smsSetting: "receive",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...client,
    id: client.id || clientId(),
    tags: client.tags ?? [],
  };
  cachedClients = sortClients([
    saved,
    ...cachedClients.filter(item => item.id !== saved.id),
  ]);
  persistLocal();
  void upsertClientRemote(saved).catch(reportRemoteError("client save"));
  return saved;
}

export function deleteClient(clientIdToDelete: string): ClientRecord[] {
  cachedClients = cachedClients.filter(
    client => client.id !== clientIdToDelete
  );
  persistLocal();
  void deleteClientRemote(clientIdToDelete).catch(
    reportRemoteError("client delete")
  );
  return cachedClients;
}

/**
 * Appends a timestamped entry to a client's contact log and persists it
 * immediately (add-only — existing entries are never modified). Returns the
 * updated client, or null if the text is empty or the client is missing.
 */
export function addClientNote(
  clientIdToUpdate: string,
  text: string,
  author?: string
): ClientRecord | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const current = cachedClients.find(client => client.id === clientIdToUpdate);
  if (!current) return null;

  const entry: ContactLogEntry = {
    id: noteId(),
    createdAt: new Date().toISOString(),
    text: trimmed,
    ...(author ? { author } : {}),
  };
  return saveClient({
    ...current,
    contactLog: [...(current.contactLog ?? []), entry],
  });
}

export function clientName(
  client: Pick<ClientRecord, "firstName" | "lastName">
) {
  return [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
}
