/**
 * Driver <-> dispatch messaging storage (dispatch_threads / participants /
 * dispatch_messages). Replaces the old customer-SMS `messageStorage.ts`.
 *
 * Same pattern as driverStorage.ts: try Supabase first, fall back to the
 * localStorage cache, emit window events so React pages re-render. Messages
 * sent while offline land in an outbox and are retried when the connection
 * comes back.
 */

import { employeeName, getEmployees } from "@/lib/employeeStorage";
import { ensureSession, supabase } from "@/lib/supabase";
import type {
  CreateThreadInput,
  DispatchMessage,
  DispatchThread,
  DispatchThreadParticipant,
} from "@/types/dispatch-messages";

const THREADS_KEY = "rejunk_dispatch_threads_v1";
const MESSAGES_KEY = "rejunk_dispatch_messages_v1";
const OUTBOX_KEY = "rejunk_dispatch_outbox_v1";

export const DISPATCH_MESSAGES_EVENT = "dispatch-messages-updated";

/** Thread shape persisted to the cache (computed fields stripped). */
type CachedThread = Omit<DispatchThread, "lastMessage" | "unreadCount">;

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
  window.localStorage.setItem(key, JSON.stringify(value));
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emitUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DISPATCH_MESSAGES_EVENT));
}

// ---------------------------------------------------------------------------
// Reachability ("Reconnecting..." banner)
// ---------------------------------------------------------------------------

let reachable = true;

function setReachable(value: boolean) {
  if (reachable === value) return;
  reachable = value;
  emitUpdated();
}

/** False after the last Supabase call failed; drives the "Reconnecting..." banner. */
export function isMessagingReachable() {
  return reachable;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * The dispatch console sends as the Owner (or Manager) employee but always
 * displays as "Dispatch" — drivers talk to "Dispatch", not a person.
 */
export function getDispatchIdentity(): { employeeId: string; senderName: string; displayName: string } {
  const employees = getEmployees().filter((employee) => employee.status === "active");
  const owner =
    employees.find((employee) => employee.role === "Owner") ??
    employees.find((employee) => employee.role === "Manager") ??
    employees[0];
  return {
    employeeId: owner?.id ?? "dispatch",
    senderName: "Dispatch",
    displayName: owner ? employeeName(owner) : "Dispatch",
  };
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type ThreadRow = {
  id: string;
  thread_type: string;
  job_id: string | null;
  title: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived: boolean;
  dispatch_thread_participants?: ParticipantRow[];
};

type ParticipantRow = {
  id: string;
  thread_id: string;
  employee_id: string;
  joined_at: string;
  last_read_at: string | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  metadata: unknown;
  created_at: string;
};

function participantFromRow(row: ParticipantRow): DispatchThreadParticipant {
  return {
    id: row.id,
    threadId: row.thread_id,
    employeeId: row.employee_id,
    joinedAt: row.joined_at,
    lastReadAt: row.last_read_at ?? undefined,
  };
}

function threadFromRow(row: ThreadRow): CachedThread {
  return {
    id: row.id,
    threadType: row.thread_type as CachedThread["threadType"],
    jobId: row.job_id ?? undefined,
    title: row.title,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived,
    participants: (row.dispatch_thread_participants ?? []).map(participantFromRow),
  };
}

export function messageFromRow(row: MessageRow): DispatchMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function readThreadCache(): CachedThread[] {
  return readJson<CachedThread[]>(THREADS_KEY, []);
}

function readMessageCache(): DispatchMessage[] {
  return readJson<DispatchMessage[]>(MESSAGES_KEY, []);
}

function upsertCachedThread(thread: CachedThread) {
  const threads = readThreadCache();
  writeJson(THREADS_KEY, [thread, ...threads.filter((item) => item.id !== thread.id)]);
}

/** Appends a message to the cache (dedupes realtime echoes of our own sends). */
function upsertCachedMessage(message: DispatchMessage) {
  const messages = readMessageCache();
  writeJson(MESSAGES_KEY, [...messages.filter((item) => item.id !== message.id), message]);
}

function bumpCachedThread(threadId: string, updatedAt: string) {
  const threads = readThreadCache();
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) return;
  upsertCachedThread({ ...thread, updatedAt });
}

function setCachedLastRead(threadId: string, employeeId: string, lastReadAt: string) {
  const threads = readThreadCache();
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) return;
  const existing = thread.participants.find((participant) => participant.employeeId === employeeId);
  const participants = existing
    ? thread.participants.map((participant) => (participant.employeeId === employeeId ? { ...participant, lastReadAt } : participant))
    : [...thread.participants, { id: newId(), threadId, employeeId, joinedAt: lastReadAt, lastReadAt }];
  upsertCachedThread({ ...thread, participants });
}

// ---------------------------------------------------------------------------
// Remote sync
// ---------------------------------------------------------------------------

async function remoteReady() {
  return Boolean(supabase) && (await ensureSession());
}

/** Pulls all threads + messages into the cache. Returns false when unreachable. */
async function syncFromRemote(): Promise<boolean> {
  if (!supabase || !(await remoteReady())) return false;
  const [threadsResult, messagesResult] = await Promise.all([
    supabase.from("dispatch_threads").select("*, dispatch_thread_participants(*)").order("updated_at", { ascending: false }),
    supabase.from("dispatch_messages").select("*").order("created_at", { ascending: true }),
  ]);
  if (threadsResult.error || messagesResult.error) {
    setReachable(false);
    return false;
  }
  writeJson(THREADS_KEY, (threadsResult.data as ThreadRow[]).map(threadFromRow));
  writeJson(MESSAGES_KEY, (messagesResult.data as MessageRow[]).map(messageFromRow));
  setReachable(true);
  void flushOutbox();
  return true;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function hydrateThread(thread: CachedThread, messages: DispatchMessage[], viewerEmployeeId: string): DispatchThread {
  const threadMessages = messages.filter((message) => message.threadId === thread.id);
  const lastMessage = threadMessages[threadMessages.length - 1];
  const lastReadAt = thread.participants.find((participant) => participant.employeeId === viewerEmployeeId)?.lastReadAt;
  const unreadCount = threadMessages.filter(
    (message) => message.senderId !== viewerEmployeeId && (!lastReadAt || message.createdAt > lastReadAt),
  ).length;
  return { ...thread, lastMessage, unreadCount };
}

/**
 * All threads, newest activity first. With `employeeId` (driver side) only
 * threads where that employee is a participant; without it (dispatch side)
 * every thread, with unread counts computed for the dispatch identity.
 */
export async function getThreads(employeeId?: string): Promise<DispatchThread[]> {
  await syncFromRemote();
  return getThreadsFromCache(employeeId);
}

/** Synchronous read of the warm cache — same filtering rules as getThreads. */
export function getThreadsFromCache(employeeId?: string): DispatchThread[] {
  const viewerId = employeeId ?? getDispatchIdentity().employeeId;
  const messages = readMessageCache();
  return readThreadCache()
    .filter((thread) => !thread.archived)
    .filter((thread) => !employeeId || thread.participants.some((participant) => participant.employeeId === employeeId))
    .map((thread) => hydrateThread(thread, messages, viewerId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getMessages(threadId: string): Promise<DispatchMessage[]> {
  if (supabase && (await remoteReady())) {
    const { data, error } = await supabase
      .from("dispatch_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (!error) {
      setReachable(true);
      const others = readMessageCache().filter((message) => message.threadId !== threadId);
      writeJson(MESSAGES_KEY, [...others, ...(data as MessageRow[]).map(messageFromRow)]);
    } else {
      setReachable(false);
    }
  }
  return getMessagesFromCache(threadId);
}

export function getMessagesFromCache(threadId: string): DispatchMessage[] {
  return readMessageCache()
    .filter((message) => message.threadId === threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Sum of per-thread unread counts — sidebar + driver home badges. */
export async function getUnreadTotal(employeeId?: string): Promise<number> {
  const threads = await getThreads(employeeId);
  return threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
}

export function getUnreadTotalFromCache(employeeId?: string): number {
  return getThreadsFromCache(employeeId).reduce((sum, thread) => sum + thread.unreadCount, 0);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function sendMessage(
  threadId: string,
  senderId: string,
  senderName: string,
  body: string,
  metadata?: Record<string, unknown>,
): Promise<DispatchMessage | null> {
  const trimmed = body.trim();
  if (!trimmed) return null;
  const now = new Date().toISOString();
  const message: DispatchMessage = { id: newId(), threadId, senderId, senderName, body: trimmed, metadata, createdAt: now };

  // Cache-first so the bubble shows instantly; senders never see their own
  // message as unread.
  upsertCachedMessage(message);
  bumpCachedThread(threadId, now);
  setCachedLastRead(threadId, senderId, now);
  emitUpdated();

  if (supabase && (await remoteReady())) {
    const { error } = await supabase.from("dispatch_messages").insert({
      id: message.id,
      thread_id: threadId,
      sender_id: senderId,
      sender_name: senderName,
      body: trimmed,
      metadata: (metadata as never) ?? null,
    });
    if (!error) {
      setReachable(true);
      await Promise.all([
        supabase.from("dispatch_threads").update({ updated_at: now }).eq("id", threadId),
        supabase
          .from("dispatch_thread_participants")
          .upsert({ thread_id: threadId, employee_id: senderId, last_read_at: now }, { onConflict: "thread_id,employee_id" }),
      ]);
      return message;
    }
    setReachable(false);
  }

  // Unreachable: queue for retry when the connection comes back.
  const outbox = readJson<DispatchMessage[]>(OUTBOX_KEY, []);
  writeJson(OUTBOX_KEY, [...outbox.filter((item) => item.id !== message.id), message]);
  return message;
}

/** Retries queued offline messages. Called after every successful sync. */
export async function flushOutbox() {
  const outbox = readJson<DispatchMessage[]>(OUTBOX_KEY, []);
  if (outbox.length === 0 || !supabase || !(await remoteReady())) return;
  const remaining: DispatchMessage[] = [];
  for (const message of outbox) {
    const { error } = await supabase.from("dispatch_messages").insert({
      id: message.id,
      thread_id: message.threadId,
      sender_id: message.senderId,
      sender_name: message.senderName,
      body: message.body,
      metadata: (message.metadata as never) ?? null,
    });
    if (error && !error.message.includes("duplicate")) remaining.push(message);
  }
  writeJson(OUTBOX_KEY, remaining);
  if (remaining.length < outbox.length) emitUpdated();
}

/**
 * Creates a thread + participant rows. Deduplicates: one direct thread per
 * driver, one job thread per job.
 */
export async function createThread(input: CreateThreadInput): Promise<DispatchThread> {
  await syncFromRemote();
  const existing = findExistingThread(input);
  if (existing) {
    await ensureParticipants(existing.id, input.participantIds);
    const viewer = input.participantIds[0] ?? getDispatchIdentity().employeeId;
    return hydrateThread(existing, readMessageCache(), viewer);
  }

  const now = new Date().toISOString();
  const thread: CachedThread = {
    id: newId(),
    threadType: input.threadType,
    jobId: input.jobId,
    title: input.title,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    archived: false,
    participants: Array.from(new Set(input.participantIds)).map((employeeId) => ({
      id: newId(),
      threadId: "",
      employeeId,
      joinedAt: now,
    })),
  };
  thread.participants = thread.participants.map((participant) => ({ ...participant, threadId: thread.id }));
  upsertCachedThread(thread);
  emitUpdated();

  if (supabase && (await remoteReady())) {
    const { error } = await supabase.from("dispatch_threads").insert({
      id: thread.id,
      thread_type: thread.threadType,
      job_id: thread.jobId ?? null,
      title: thread.title,
      created_by: thread.createdBy ?? null,
      created_at: now,
      updated_at: now,
    });
    if (!error) {
      setReachable(true);
      if (thread.participants.length > 0) {
        await supabase.from("dispatch_thread_participants").upsert(
          thread.participants.map((participant) => ({
            id: participant.id,
            thread_id: thread.id,
            employee_id: participant.employeeId,
            joined_at: participant.joinedAt,
          })),
          { onConflict: "thread_id,employee_id" },
        );
      }
    } else {
      setReachable(false);
    }
  }
  return { ...thread, unreadCount: 0 };
}

function findExistingThread(input: CreateThreadInput): CachedThread | undefined {
  const threads = readThreadCache();
  if (input.threadType === "job" && input.jobId) {
    return threads.find((thread) => thread.threadType === "job" && thread.jobId === input.jobId);
  }
  if (input.threadType === "direct") {
    // A direct thread is dispatch + one driver. Match on the driver side so a
    // dispatch-created and a driver-created thread converge on the same row.
    const dispatchId = getDispatchIdentity().employeeId;
    const drivers = input.participantIds.filter((participantId) => participantId !== dispatchId);
    const targets = drivers.length > 0 ? drivers : input.participantIds;
    return threads.find(
      (thread) =>
        thread.threadType === "direct" &&
        targets.every((target) => thread.participants.some((participant) => participant.employeeId === target)),
    );
  }
  return undefined;
}

/** Adds any missing participant rows when an existing thread is reused. */
async function ensureParticipants(threadId: string, participantIds: string[]) {
  const thread = readThreadCache().find((item) => item.id === threadId);
  if (!thread) return;
  const now = new Date().toISOString();
  const missing = Array.from(new Set(participantIds)).filter(
    (employeeId) => !thread.participants.some((participant) => participant.employeeId === employeeId),
  );
  if (missing.length === 0) return;
  upsertCachedThread({
    ...thread,
    participants: [...thread.participants, ...missing.map((employeeId) => ({ id: newId(), threadId, employeeId, joinedAt: now }))],
  });
  if (supabase && (await remoteReady())) {
    await supabase.from("dispatch_thread_participants").upsert(
      missing.map((employeeId) => ({ thread_id: threadId, employee_id: employeeId, joined_at: now })),
      { onConflict: "thread_id,employee_id" },
    );
  }
}

/** Used by sendJobMessage: returns the job's thread, creating it on first message. */
export async function findOrCreateJobThread(jobId: string, jobTitle: string, participantIds: string[]): Promise<DispatchThread> {
  return createThread({ threadType: "job", jobId, title: jobTitle, participantIds });
}

export async function markThreadRead(threadId: string, employeeId: string) {
  const now = new Date().toISOString();
  setCachedLastRead(threadId, employeeId, now);
  emitUpdated();
  if (supabase && (await remoteReady())) {
    await supabase
      .from("dispatch_thread_participants")
      .upsert({ thread_id: threadId, employee_id: employeeId, last_read_at: now }, { onConflict: "thread_id,employee_id" });
  }
}

export async function setThreadArchived(threadId: string, archived: boolean) {
  const thread = readThreadCache().find((item) => item.id === threadId);
  if (thread) {
    upsertCachedThread({ ...thread, archived });
    emitUpdated();
  }
  if (supabase && (await remoteReady())) {
    await supabase.from("dispatch_threads").update({ archived }).eq("id", threadId);
  }
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

/**
 * Live message inserts. The new message is folded into the cache (deduped
 * against our own optimistic sends) before the callback fires; an "updated"
 * window event also fires so list views refresh. Returns an unsubscribe fn.
 */
export function subscribeToMessages(callback: (message: DispatchMessage) => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`dispatch-messages-${newId()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "dispatch_messages" }, (payload) => {
      const message = messageFromRow(payload.new as MessageRow);
      const known = readMessageCache().some((item) => item.id === message.id);
      upsertCachedMessage(message);
      bumpCachedThread(message.threadId, message.createdAt);
      emitUpdated();
      if (!known) callback(message);
    })
    .subscribe();
  return () => {
    void supabase?.removeChannel(channel);
  };
}

/** Live thread inserts/updates (new conversations, archive, updated_at bumps). */
export function subscribeToThreads(callback: () => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`dispatch-threads-${newId()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "dispatch_threads" }, () => {
      // Participants aren't in the realtime payload; refetch to stay accurate.
      void syncFromRemote().then(() => {
        emitUpdated();
        callback();
      });
    })
    .subscribe();
  return () => {
    void supabase?.removeChannel(channel);
  };
}
