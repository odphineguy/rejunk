import type { EventRecord } from "@/types/events";

const EVENTS_KEY = "junk_estimator_events_v1";

const defaultEvents: EventRecord[] = [];

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

function readEvents() {
  if (!canUseLocalStorage()) return defaultEvents;
  try {
    const raw = window.localStorage.getItem(EVENTS_KEY);
    return raw ? (JSON.parse(raw) as EventRecord[]) : defaultEvents;
  } catch {
    return defaultEvents;
  }
}

function writeEvents(events: EventRecord[]) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  window.dispatchEvent(new Event("events-updated"));
}

function eventId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `event-${Date.now()}`;
}

export function getEvents(): EventRecord[] {
  return readEvents().sort((a, b) => `${a.startDate} ${a.startTime}`.localeCompare(`${b.startDate} ${b.startTime}`));
}

export function getEvent(eventIdToFind: string): EventRecord | null {
  return getEvents().find((event) => event.id === eventIdToFind) ?? null;
}

export function saveEvent(event: Partial<EventRecord> & Pick<EventRecord, "title">): EventRecord {
  const current = readEvents();
  const existing = event.id ? current.find((item) => item.id === event.id) : undefined;
  const timestamp = new Date().toISOString();
  const saved: EventRecord = {
    private: true,
    startDate: formatInputDate(new Date()),
    startTime: "21:00",
    endTime: "22:00",
    ...existing,
    ...event,
    id: event.id || eventId(),
    title: event.title,
    createdAt: existing?.createdAt ?? event.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  writeEvents([saved, ...current.filter((item) => item.id !== saved.id)]);
  return saved;
}

export function deleteEvent(eventIdToDelete: string): EventRecord[] {
  const next = readEvents().filter((event) => event.id !== eventIdToDelete);
  writeEvents(next);
  return next;
}

export function eventAddress(event: Pick<EventRecord, "streetAddress" | "unit" | "city" | "state" | "zip">) {
  return [event.streetAddress, event.unit, [event.city, event.state, event.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function formatInputDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
