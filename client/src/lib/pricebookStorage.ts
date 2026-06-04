import type { PricebookCategory, PricebookItem } from "@/types/pricebook";

const PRICEBOOK_KEY = "junk_estimator_pricebook_v1";

type PricebookState = {
  categories: PricebookCategory[];
  items: PricebookItem[];
};

const now = "2026-06-01T18:45:00.000Z";

const defaultCategories: PricebookCategory[] = [
  {
    id: "category-junk-removal",
    name: "Junk Removal",
    description:
      "Junk removal is the process of collecting, hauling, and responsibly disposing of unwanted items, debris, and waste from homes, businesses, or construction sites.",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "category-dumpster-rental",
    name: "Dumpster Rental",
    description:
      "Dumpster rental is a service that provides temporary waste containers for homes, businesses, or construction projects, allowing for easy disposal of debris and junk.",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "category-overages",
    name: "Overages",
    description: "Applies when the job exceeds the selected load size, time, or labor and requires additional truck space or effort.",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "category-fees",
    name: "Fees",
    description: "Additional charges that may apply for payment processing, special handling, or regulated disposal requirements.",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "category-demolition",
    name: "Demolition",
    description: "Light demolition services such as sheds, small structures, or interior tear-outs, including teardown, loading, and hot tubs.",
    createdAt: now,
    updatedAt: now,
  },
];

const defaultItems: PricebookItem[] = [
  {
    id: "item-hot-tub-removal",
    name: "Demo - Hot Tub Removal",
    price: 450,
    cost: 0,
    categoryId: "category-demolition",
    itemType: "Service",
    description:
      "Hot tub removed safely and professionally; when one-piece removal is not possible, the unit is cut into up to four sections to ensure safe transport and proper disposal. All labor, cutting, loading, and cleanup are included.",
    addToOnlineBooking: false,
    taxable: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "item-shed-removal",
    name: "Demo - Shed Removal",
    price: 450,
    cost: 0,
    categoryId: "category-demolition",
    itemType: "Service",
    description: "We tear down and haul away sheds, small outbuildings, and similar light structures.",
    addToOnlineBooking: false,
    taxable: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "item-bed-bugs",
    name: "Fees - Bed Bugs",
    price: 300,
    cost: 0,
    categoryId: "category-fees",
    itemType: "Fee",
    description: "Items contaminated with bed bugs require special handling, wrapping, and disposal precautions.",
    addToOnlineBooking: false,
    taxable: false,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "item-disassemble",
    name: "Fees - Disassemble Item",
    price: 20,
    cost: 0,
    categoryId: "category-fees",
    itemType: "Fee",
    description: "We safely take apart items so they can be removed without damaging the property.",
    addToOnlineBooking: false,
    taxable: false,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "item-drug-paraphernalia",
    name: "Fees - Drug Paraphernalia",
    price: 50,
    cost: 0,
    categoryId: "category-fees",
    itemType: "Fee",
    description: "Applies to items that require special handling due to regulated or unsafe materials.",
    addToOnlineBooking: false,
    taxable: false,
    createdAt: now,
    updatedAt: now,
  },
];

const defaultState: PricebookState = {
  categories: defaultCategories,
  items: defaultItems,
};

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

function readPricebook(): PricebookState {
  if (!canUseLocalStorage()) return defaultState;
  try {
    const raw = window.localStorage.getItem(PRICEBOOK_KEY);
    return raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState;
  } catch {
    return defaultState;
  }
}

function writePricebook(pricebook: PricebookState) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(PRICEBOOK_KEY, JSON.stringify(pricebook));
  window.dispatchEvent(new Event("pricebook-updated"));
}

function idFor(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`;
}

export function getPricebook(): PricebookState {
  return readPricebook();
}

export function savePricebookCategory(category: Partial<PricebookCategory> & Pick<PricebookCategory, "name">): PricebookCategory {
  const pricebook = readPricebook();
  const existing = category.id ? pricebook.categories.find((item) => item.id === category.id) : undefined;
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
  writePricebook({
    ...pricebook,
    categories: [saved, ...pricebook.categories.filter((item) => item.id !== saved.id)],
  });
  return saved;
}

export function savePricebookItem(item: Partial<PricebookItem> & Pick<PricebookItem, "name" | "categoryId">): PricebookItem {
  const pricebook = readPricebook();
  const existing = item.id ? pricebook.items.find((entry) => entry.id === item.id) : undefined;
  const timestamp = new Date().toISOString();
  const saved: PricebookItem = {
    price: 0,
    cost: 0,
    itemType: "Service",
    description: "",
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
  writePricebook({
    ...pricebook,
    items: [saved, ...pricebook.items.filter((entry) => entry.id !== saved.id)],
  });
  return saved;
}

export function deletePricebookCategory(categoryId: string): PricebookState {
  const pricebook = readPricebook();
  const next = {
    categories: pricebook.categories.filter((category) => category.id !== categoryId),
    items: pricebook.items.filter((item) => item.categoryId !== categoryId),
  };
  writePricebook(next);
  return next;
}

export function deletePricebookItem(itemId: string): PricebookState {
  const pricebook = readPricebook();
  const next = {
    ...pricebook,
    items: pricebook.items.filter((item) => item.id !== itemId),
  };
  writePricebook(next);
  return next;
}
