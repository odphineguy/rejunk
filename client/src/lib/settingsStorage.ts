// Supabase-backed persistence for the /settings/* sub-pages, with localStorage
// as the warm cache / offline fallback (same pattern as pricingStorage):
// hydrate once at startup, read synchronously from the cache, write-through in
// the background. Each section is one `app_settings` row (key = section) and
// one `rejunk-settings-{section}` localStorage key. Writes dispatch a
// `settings-updated` window event (detail.section) so other components can
// react, matching the jobs-updated / employees-updated convention.

import { ensureSession, supabase } from "@/lib/supabase";
import type { Json } from "@/types/database.types";

export const SETTINGS_EVENT = "settings-updated";

const STORAGE_PREFIX = "rejunk-settings-";

const keyFor = (section: string) => `${STORAGE_PREFIX}${section}`;

const canUseLocalStorage = () =>
  typeof window !== "undefined" && Boolean(window.localStorage);

function dispatchSettingsEvent(section: string) {
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: { section } }));
}

export function loadSettingsSection<T extends object>(
  section: string,
  defaults: T
): T {
  if (!canUseLocalStorage()) return defaults;
  try {
    const raw = window.localStorage.getItem(keyFor(section));
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return defaults;
  }
}

export function saveSettingsSection<T extends object>(
  section: string,
  value: T
): T {
  if (canUseLocalStorage()) {
    window.localStorage.setItem(keyFor(section), JSON.stringify(value));
    dispatchSettingsEvent(section);
  }
  void pushSection(section, value);
  return value;
}

/** Fire-and-forget upsert; a failed sync keeps the localStorage copy intact. */
async function pushSection(section: string, value: object) {
  if (!supabase) return;
  if (!(await ensureSession())) return;
  const { error } = await supabase.from("app_settings").upsert(
    { key: section, value: value as Json, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) {
    console.error(`[settings] Failed to sync "${section}" to Supabase:`, error.message);
  }
}

/**
 * Pulls all settings rows from Supabase into the localStorage cache, awaited
 * in main.tsx alongside the other hydrators (and racing the same render
 * timeout, so an unreachable backend can't block the UI). Sections that exist
 * only locally — saved before this table existed, or while offline — are
 * promoted up to Supabase instead of being overwritten.
 */
export async function hydrateSettings(): Promise<void> {
  if (!supabase || !canUseLocalStorage()) return;
  if (!(await ensureSession())) return;

  const { data, error } = await supabase.from("app_settings").select("key, value");
  if (error) {
    console.error("[settings] Hydration from Supabase failed:", error.message);
    return;
  }

  const remoteSections = new Set<string>();
  for (const row of data ?? []) {
    remoteSections.add(row.key);
    const raw = JSON.stringify(row.value ?? {});
    if (window.localStorage.getItem(keyFor(row.key)) !== raw) {
      window.localStorage.setItem(keyFor(row.key), raw);
      dispatchSettingsEvent(row.key);
    }
  }

  const localOnly: string[] = [];
  for (let index = 0; index < window.localStorage.length; index++) {
    const storageKey = window.localStorage.key(index);
    if (!storageKey?.startsWith(STORAGE_PREFIX)) continue;
    const section = storageKey.slice(STORAGE_PREFIX.length);
    if (!remoteSections.has(section)) localOnly.push(section);
  }
  for (const section of localOnly) {
    try {
      const value = JSON.parse(window.localStorage.getItem(keyFor(section)) ?? "");
      if (value && typeof value === "object") await pushSection(section, value);
    } catch {
      // Unparseable cache entry — leave it for loadSettingsSection's fallback.
    }
  }
}
