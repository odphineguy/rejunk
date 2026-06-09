import { defaultPricebookCategories, defaultPricebookItems } from "@/data/defaultPricebook";
import {
  deletePricebookCategoryRemote,
  deletePricebookItemRemote,
  loadPricebookRemote,
  seedPricebookRemote,
  upsertPricebookCategoryRemote,
  upsertPricebookItemRemote,
} from "@/lib/dataStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { PricebookCategory, PricebookItem } from "@/types/pricebook";

// Bumped to v2 when the localStorage shape changed (full Pricebook v4 catalog +
// new item fields). v1 held only the old 5 demo items; ignoring it forces the
// fresh default before Supabase hydration lands.
const PRICEBOOK_KEY = "junk_estimator_pricebook_v2";
const PRICEBOOK_SEEDED_KEY = "junk_estimator_pricebook_seeded_v1";

export type PricebookState = {
  categories: PricebookCategory[];
  items: PricebookItem[];
};

const defaultState: PricebookState = {
  categories: defaultPricebookCategories,
  items: defaultPricebookItems,
};

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

function idFor(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`;
}

// Synchronous in-memory cache. The page reads this synchronously; Supabase reads
// happen via hydratePricebook() and writes are fire-and-forget. localStorage is a
// warm offline cache / fallback.
let cache: PricebookState = readJson<PricebookState>(PRICEBOOK_KEY, defaultState);

function reportRemoteError(context: string) {
  return (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pricebookStorage] Remote ${context} failed; local cache kept in sync.`, message);
  };
}

function commit(next: PricebookState) {
  cache = next;
  writeJson(PRICEBOOK_KEY, cache);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("pricebook-updated"));
}

/**
 * Loads the pricebook from Supabase into the in-memory cache. Call once at startup
 * BEFORE rendering. Falls back to the localStorage cache when Supabase is
 * unconfigured/unreachable. First run against an empty pricebook promotes the
 * default v4 catalog to shared data (one-time, guarded by a localStorage flag).
 */
export async function hydratePricebook(): Promise<void> {
  if (!isSupabaseConfigured) return;

  const remote = await loadPricebookRemote().catch((error) => {
    reportRemoteError("pricebook load")(error);
    return null;
  });
  if (!remote) return; // unreachable — keep the local cache

  const alreadySeeded = canUseLocalStorage() && window.localStorage.getItem(PRICEBOOK_SEEDED_KEY) === "1";

  if (remote.categories.length === 0 && remote.items.length === 0 && !alreadySeeded) {
    if (canUseLocalStorage()) window.localStorage.setItem(PRICEBOOK_SEEDED_KEY, "1");
    void seedPricebookRemote(defaultPricebookCategories, defaultPricebookItems).catch(reportRemoteError("pricebook seed"));
    commit(defaultState);
  } else if (remote.categories.length > 0 || remote.items.length > 0) {
    commit({ categories: remote.categories, items: remote.items });
  }
}

export function getPricebook(): PricebookState {
  return cache;
}

export function savePricebookCategory(
  category: Partial<PricebookCategory> & Pick<PricebookCategory, "name">,
): PricebookCategory {
  const existing = category.id ? cache.categories.find((item) => item.id === category.id) : undefined;
  const timestamp = new Date().toISOString();
  const saved: PricebookCategory = {
    description: "",
    ...existing,
    ...category,
    id: category.id || idFor("category"),
    name: category.name,
    createdAt: existing?.createdAt ?? category.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  commit({
    ...cache,
    categories: [saved, ...cache.categories.filter((item) => item.id !== saved.id)],
  });
  void upsertPricebookCategoryRemote(saved).catch(reportRemoteError("category save"));
  return saved;
}

export function savePricebookItem(
  item: Partial<PricebookItem> & Pick<PricebookItem, "name" | "categoryId">,
): PricebookItem {
  const existing = item.id ? cache.items.find((entry) => entry.id === item.id) : undefined;
  const timestamp = new Date().toISOString();
  const saved: PricebookItem = {
    price: 0,
    cost: 0,
    itemType: "Service",
    description: "",
    priceUnit: "flat",
    photoRequired: false,
    addToOnlineBooking: false,
    taxable: false,
    ...existing,
    ...item,
    id: item.id || idFor("item"),
    name: item.name,
    categoryId: item.categoryId,
    createdAt: existing?.createdAt ?? item.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  commit({
    ...cache,
    items: [saved, ...cache.items.filter((entry) => entry.id !== saved.id)],
  });
  void upsertPricebookItemRemote(saved).catch(reportRemoteError("item save"));
  return saved;
}

export function deletePricebookCategory(categoryId: string): PricebookState {
  commit({
    categories: cache.categories.filter((category) => category.id !== categoryId),
    items: cache.items.filter((item) => item.categoryId !== categoryId),
  });
  void deletePricebookCategoryRemote(categoryId).catch(reportRemoteError("category delete"));
  return cache;
}

export function deletePricebookItem(itemId: string): PricebookState {
  commit({
    ...cache,
    items: cache.items.filter((item) => item.id !== itemId),
  });
  void deletePricebookItemRemote(itemId).catch(reportRemoteError("item delete"));
  return cache;
}
