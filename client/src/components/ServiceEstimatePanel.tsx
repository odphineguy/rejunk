import { useEffect, useMemo, useState } from "react";
import { Copy, Minus, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PhotoRequiredBanner } from "@/components/PhotoRequiredBanner";
import { loadMapScript } from "@/components/Map";
import { getPricebook } from "@/lib/pricebookStorage";
import { saveEstimate } from "@/utils/pricingStorage";
import { calculateServiceEstimate, DEFAULT_SERVICE_CONFIG } from "@/utils/serviceCalculator";
import { getPointToPointRoute, type PointToPointRoute } from "@/utils/distanceRouting";
import type { PricebookCategory, PricebookItem } from "@/types/pricebook";
import type { JobServiceType } from "@/types/jobs";
import type { SavedEstimate } from "@/types/pricing";
import type { MovingVehicle, ServiceEstimateSnapshot, ServiceQuoteEntry, StairFloor } from "@/types/service";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const currency2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function money(value: number | undefined) {
  return currency.format(Number.isFinite(value) ? Number(value) : 0);
}
function money2(value: number | undefined) {
  return currency2.format(Number.isFinite(value) ? Number(value) : 0);
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `estimate-${Date.now()}`;
}

const stairOptions: { value: StairFloor; label: string }[] = [
  { value: "none", label: "No stairs / elevator" },
  { value: "2nd", label: "2nd floor (+$100/dir)" },
  { value: "3rd", label: "3rd floor (+$200/dir)" },
  { value: "above_3rd", label: "Above 3rd floor (+$300/dir)" },
];

// Moving mode: each location is one direction, so the label drops "/dir".
const locationStairOptions: { value: StairFloor; label: string }[] = [
  { value: "none", label: "No stairs / elevator" },
  { value: "2nd", label: "2nd floor (+$100)" },
  { value: "3rd", label: "3rd floor (+$200)" },
  { value: "above_3rd", label: "Above 3rd floor (+$300)" },
];

function stairRate(floor: StairFloor) {
  const rates = DEFAULT_SERVICE_CONFIG.stairRates;
  switch (floor) {
    case "2nd":
      return rates.second;
    case "3rd":
      return rates.third;
    case "above_3rd":
      return rates.aboveThird;
    default:
      return 0;
  }
}

function stairFloorLabel(floor: StairFloor) {
  switch (floor) {
    case "2nd":
      return "2nd floor";
    case "3rd":
      return "3rd floor";
    case "above_3rd":
      return "above 3rd floor";
    default:
      return "none";
  }
}

/** Travel fee covers the first 15 route miles; beyond that, per-mile excess applies. */
const FREE_ROUTE_MILES = 15;

/** Pricebook ids the vehicle selector manages automatically — kept out of the
 * manual surcharge picker in moving mode so they can't be double-added. */
const AUTO_MOVING_FEE_IDS = new Set(["moving-travel-van", "moving-travel-box", "moving-mileage-van", "moving-mileage-box"]);

/** Items that need no vehicle at all (customer provides the truck / on-site labor). */
const NO_VEHICLE_ITEM_IDS = new Set(["moving-labor-only", "moving-additional-mover"]);

const TRAVEL_FEE_ID: Record<MovingVehicle, string> = { van: "moving-travel-van", box_truck: "moving-travel-box" };
const MILEAGE_FEE_ID: Record<MovingVehicle, string> = { van: "moving-mileage-van", box_truck: "moving-mileage-box" };

const SERVICE_TYPE_BY_CATEGORY: Record<string, JobServiceType> = {
  "cat-assembly": "furniture_assembly",
  "cat-equipment-assembly": "furniture_assembly",
  "cat-handyman": "other",
  "cat-appliance": "appliance_moving",
  "cat-cleaning": "other",
  "cat-moving": "moving",
  "cat-moving-hourly": "moving",
  "cat-moving-travel": "moving",
  "cat-moving-specialty": "specialty_moving",
};

function unitSuffix(unit: PricebookItem["priceUnit"]) {
  switch (unit) {
    case "hourly":
      return "/hr";
    case "per_item":
      return "/item";
    case "per_mile":
      return "/mi";
    case "per_30min":
      return "/30min";
    case "percent":
      return "%";
    default:
      return "";
  }
}

function CrewBadge({ crewSize }: { crewSize: number }) {
  if (crewSize <= 1) return <Badge variant="secondary">1 worker</Badge>;
  return <Badge className="bg-amber-600 text-white">⚠️ {crewSize} workers</Badge>;
}

function QtyStepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => onChange(Math.max(0, value - 1))} aria-label="Decrease quantity">
        <Minus className="size-3" />
      </Button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">{value}</span>
      <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => onChange(value + 1)} aria-label="Increase quantity">
        <Plus className="size-3" />
      </Button>
    </div>
  );
}

/** Which Pricebook slice the panel quotes from. Both run the same calculator;
 * "moving" scopes the pickers to the moving categories and seeds hourly crews
 * at the 2-hour moving minimum. */
export type ServicePanelMode = "service" | "moving";

const PANEL_COPY: Record<ServicePanelMode, {
  itemsTitle: string;
  itemsDescription: string;
  itemPlaceholder: string;
  emptyText: string;
  quoteTitle: string;
  loadLabel: string;
  savedToast: string;
  quoteHeading: string;
}> = {
  service: {
    itemsTitle: "Service Items",
    itemsDescription: "Flat-rate assembly, handyman, appliance, and cleaning items from the Pricebook.",
    itemPlaceholder: "Add a service item…",
    emptyText: "No items yet. Use the dropdown to add assembly, handyman, appliance, or cleaning items.",
    quoteTitle: "Service Quote",
    loadLabel: "Service / Task",
    savedToast: "Service estimate saved",
    quoteHeading: "Service Estimate",
  },
  moving: {
    itemsTitle: "Moving Items",
    itemsDescription: "Flat-rate moves, hourly crews, and specialty items (pianos, safes, hot tubs). 2-hour minimum on all moving jobs.",
    itemPlaceholder: "Add a move, hourly crew, or specialty item…",
    emptyText: "No items yet. Pick a flat-rate move, an hourly crew, or a specialty item from the dropdown.",
    quoteTitle: "Moving Quote",
    loadLabel: "Moving",
    savedToast: "Moving estimate saved",
    quoteHeading: "Moving Estimate",
  },
};

export interface ServiceEstimatePanelProps {
  mode: ServicePanelMode;
  customerName: string;
  jobAddress: string;
  /** Moving mode: pickup is the primary address (same value as jobAddress). */
  pickupAddress?: string;
  deliveryAddress?: string;
  notes: string;
  onSaved: () => void;
  /** Moving mode: lets the parent clear moving-only Job Info fields on Reset. */
  onResetMoving?: () => void;
  loadSeed?: SavedEstimate | null;
}

export function ServiceEstimatePanel({
  mode,
  customerName,
  jobAddress,
  pickupAddress,
  deliveryAddress,
  notes,
  onSaved,
  onResetMoving,
  loadSeed,
}: ServiceEstimatePanelProps) {
  const copy = PANEL_COPY[mode];
  const [pricebook, setPricebook] = useState(() => getPricebook());
  const [itemQty, setItemQty] = useState<Record<string, number>>({});
  const [surchargeQty, setSurchargeQty] = useState<Record<string, number>>({});
  const [stairFloor, setStairFloor] = useState<StairFloor>("none");
  const [stairDirections, setStairDirections] = useState<1 | 2>(1);
  // Moving-only state. vehicleChoice null = follow the auto default for the items on the quote.
  const [pickupStairFloor, setPickupStairFloor] = useState<StairFloor>("none");
  const [deliveryStairFloor, setDeliveryStairFloor] = useState<StairFloor>("none");
  const [vehicleChoice, setVehicleChoice] = useState<MovingVehicle | null>(null);
  const [route, setRoute] = useState<PointToPointRoute | null>(null);

  useEffect(() => {
    const refresh = () => setPricebook(getPricebook());
    window.addEventListener("pricebook-updated", refresh);
    return () => window.removeEventListener("pricebook-updated", refresh);
  }, []);

  // Hydrate from a saved service estimate when the user loads one.
  useEffect(() => {
    if (!loadSeed?.service) return;
    const seedItems: Record<string, number> = {};
    const seedSurcharges: Record<string, number> = {};
    loadSeed.service.lineItems.forEach((line) => (seedItems[line.itemId] = line.quantity));
    loadSeed.service.surcharges.forEach((line) => {
      // Travel/mileage fees are auto-managed by the vehicle selector now — don't
      // also restore them as manual surcharges (older saves may carry them).
      if (mode === "moving" && AUTO_MOVING_FEE_IDS.has(line.itemId)) return;
      seedSurcharges[line.itemId] = line.quantity;
    });
    setItemQty(seedItems);
    setSurchargeQty(seedSurcharges);
    setStairFloor(loadSeed.service.stairFloor);
    setStairDirections(loadSeed.service.stairDirections);
    if (mode === "moving") {
      // Legacy moving saves only have floor × directions — map them onto the
      // per-location model so the restored total matches what was saved.
      const legacyFloor = loadSeed.service.stairFloor ?? "none";
      setPickupStairFloor(loadSeed.service.pickupStairFloor ?? legacyFloor);
      setDeliveryStairFloor(
        loadSeed.service.deliveryStairFloor ?? (loadSeed.service.stairDirections === 2 ? legacyFloor : "none"),
      );
      setVehicleChoice(loadSeed.service.movingVehicle ?? null);
    }
  }, [loadSeed?.id]);

  const itemsById = useMemo(() => Object.fromEntries(pricebook.items.map((item) => [item.id, item])), [pricebook.items]);

  // Quotable items for this tab's mode, excluding fees + the auto discount.
  const panelCategoryMode = mode === "moving" ? "moving" : "assembly_service";
  const serviceGroups = useMemo(() => {
    const sorted = [...pricebook.categories].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
    return sorted
      .filter((category) => category.mode === panelCategoryMode)
      .map((category) => ({
        category,
        items: pricebook.items.filter(
          (item) => item.categoryId === category.id && item.itemType !== "Fee" && item.id !== "assembly-multi-item-discount",
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [pricebook.categories, pricebook.items, panelCategoryMode]);

  // Surcharge / fee items (excludes the stair items — those use the dedicated control — and the
  // auto discount). Moving-specific fees (travel, mileage, liftgate) only show on the Moving tab;
  // generic surcharges/overages/fees show on both.
  const surchargeGroups = useMemo(() => {
    const categoryModeById = new Map(pricebook.categories.map((c) => [c.id, c.mode]));
    const fees = pricebook.items.filter(
      (item) =>
        item.itemType === "Fee" &&
        item.id !== "assembly-multi-item-discount" &&
        !item.id.startsWith("surcharge-stairs-") &&
        (categoryModeById.get(item.categoryId) !== "moving" || mode === "moving") &&
        // Travel + excess mileage are auto-applied by the vehicle selector in moving mode.
        !(mode === "moving" && AUTO_MOVING_FEE_IDS.has(item.id)),
    );
    const byCategory = new Map<string, { category: PricebookCategory | undefined; items: PricebookItem[] }>();
    fees.forEach((item) => {
      const category = pricebook.categories.find((c) => c.id === item.categoryId);
      const key = item.categoryId || "other";
      if (!byCategory.has(key)) byCategory.set(key, { category, items: [] });
      byCategory.get(key)!.items.push(item);
    });
    return Array.from(byCategory.values());
  }, [pricebook.categories, pricebook.items]);

  const lineEntries: ServiceQuoteEntry[] = useMemo(
    () =>
      Object.entries(itemQty)
        .map(([id, quantity]) => ({ item: itemsById[id], quantity }))
        .filter((entry) => entry.item && entry.quantity > 0),
    [itemQty, itemsById],
  );
  const surchargeEntries: ServiceQuoteEntry[] = useMemo(
    () =>
      Object.entries(surchargeQty)
        .map(([id, quantity]) => ({ item: itemsById[id], quantity }))
        .filter((entry) => entry.item && entry.quantity > 0),
    [surchargeQty, itemsById],
  );

  // ── Moving vehicle + auto fees ───────────────────────────────────────────
  // The selector only matters when something on the quote needs a vehicle;
  // labor-only work (customer's truck) never gets a travel fee.
  const movingVehicleNeeded = mode === "moving" && lineEntries.some((entry) => !NO_VEHICLE_ITEM_IDS.has(entry.item.id));
  // Default: box truck for flat-rate home moves / 2BR apartments / explicit
  // box-truck crews; cargo van otherwise. The user can always override.
  const autoVehicle: MovingVehicle = useMemo(
    () =>
      lineEntries.some(
        (entry) =>
          entry.item.name.includes("Home Move") ||
          entry.item.name.includes("Apartment Move — 2BR") ||
          entry.item.name.includes("Box Truck"),
      )
        ? "box_truck"
        : "van",
    [lineEntries],
  );
  const movingVehicle: MovingVehicle | null = movingVehicleNeeded ? (vehicleChoice ?? autoVehicle) : null;

  const routeMiles = mode === "moving" ? route?.miles ?? null : null;
  const excessMiles = routeMiles != null && routeMiles > FREE_ROUTE_MILES ? Math.round((routeMiles - FREE_ROUTE_MILES) * 10) / 10 : 0;

  // Travel fee + excess mileage as synthetic line entries fed straight to the
  // calculator — they show in the quote summary but not in the manual surcharge list.
  const autoMovingEntries: ServiceQuoteEntry[] = useMemo(() => {
    if (!movingVehicle) return [];
    const entries: ServiceQuoteEntry[] = [];
    const travelItem = itemsById[TRAVEL_FEE_ID[movingVehicle]];
    if (travelItem) entries.push({ item: travelItem, quantity: 1 });
    if (excessMiles > 0) {
      const mileageItem = itemsById[MILEAGE_FEE_ID[movingVehicle]];
      if (mileageItem) {
        entries.push({
          item: { ...mileageItem, name: `Excess mileage (${excessMiles} mi × ${money2(mileageItem.price)})` },
          quantity: excessMiles,
        });
      }
    }
    return entries;
  }, [movingVehicle, excessMiles, itemsById]);

  const result = useMemo(
    () =>
      calculateServiceEstimate({
        lineItems: lineEntries,
        surcharges: [...surchargeEntries, ...autoMovingEntries],
        stairFloor,
        stairDirections,
        ...(mode === "moving" ? { pickupStairFloor, deliveryStairFloor } : {}),
      }),
    [lineEntries, surchargeEntries, autoMovingEntries, stairFloor, stairDirections, mode, pickupStairFloor, deliveryStairFloor],
  );

  // Route distance between pickup and delivery (debounced — same Distance Matrix
  // pattern as the junk tab's facility routing).
  useEffect(() => {
    if (mode !== "moving") return;
    const origin = (pickupAddress ?? "").trim();
    const destination = (deliveryAddress ?? "").trim();
    if (!origin || !destination) {
      setRoute(null);
      return;
    }
    let canceled = false;
    const timer = window.setTimeout(() => {
      loadMapScript()
        .then(() => getPointToPointRoute(origin, destination))
        .then((next) => {
          if (!canceled) setRoute(next);
        })
        .catch(() => {
          if (!canceled) setRoute(null);
        });
    }, 600);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [mode, pickupAddress, deliveryAddress]);

  const hasItems = lineEntries.length > 0;

  const setItem = (id: string, qty: number) =>
    setItemQty((current) => {
      const next = { ...current };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  const setSurcharge = (id: string, qty: number) =>
    setSurchargeQty((current) => {
      const next = { ...current };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });

  const addItem = (id: string) => {
    const item = itemsById[id];
    // Hourly moving crews start at the 2-hour moving minimum (the calculator
    // also enforces it, but seeding 2 keeps what's shown honest).
    const seed = item?.mode === "moving" && item.priceUnit === "hourly" ? 2 : 1;
    setItem(id, (itemQty[id] ?? 0) + (itemQty[id] ? 1 : seed));
  };
  const addSurcharge = (id: string) => setSurcharge(id, (surchargeQty[id] ?? 0) + 1);

  const reset = () => {
    setItemQty({});
    setSurchargeQty({});
    setStairFloor("none");
    setStairDirections(1);
    setPickupStairFloor("none");
    setDeliveryStairFloor("none");
    setVehicleChoice(null);
    setRoute(null);
    if (mode === "moving") onResetMoving?.();
  };

  const deriveServiceType = (): JobServiceType => {
    for (const entry of lineEntries) {
      const mapped = SERVICE_TYPE_BY_CATEGORY[entry.item.categoryId];
      if (mapped) return mapped;
    }
    return "other";
  };

  const buildSnapshot = (): ServiceEstimateSnapshot => ({
    lineItems: result.lineItems,
    surcharges: result.surcharges,
    stairFloor,
    stairDirections,
    ...(mode === "moving"
      ? {
          pickupStairFloor,
          deliveryStairFloor,
          movingVehicle: movingVehicle ?? undefined,
          routeMiles: route?.miles ?? undefined,
          routeDriveMinutes: route?.driveMinutes ?? undefined,
        }
      : {}),
    itemsSubtotal: result.itemsSubtotal,
    discountApplied: result.discountApplied,
    discountAmount: result.discountAmount,
    stairSurcharge: result.stairSurcharge,
    surchargesTotal: result.surchargesTotal,
    total: result.total,
    crewSize: result.crewSize,
    estimatedCost: result.estimatedCost,
    grossProfitDollars: result.grossProfitDollars,
    grossMarginDecimal: result.grossMarginDecimal,
    photoRequired: result.photoRequired,
  });

  const handleSave = () => {
    if (!hasItems) {
      toast.error("Add at least one service item before saving.");
      return;
    }
    const now = new Date().toISOString();
    const primaryName = result.lineItems[0]?.name ?? (mode === "moving" ? "Moving" : "Service");
    const estimate: SavedEstimate = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      customerName: customerName || undefined,
      jobAddress: jobAddress || undefined,
      deliveryAddress: mode === "moving" ? deliveryAddress?.trim() || undefined : undefined,
      loadLabel: copy.loadLabel,
      materialName: primaryName,
      // Placeholder — service estimates are distinguished by `mode`, not material.
      materialType: "household_junk",
      vehicleId: "",
      facilityId: "",
      cubicYards: 0,
      estimatedWeightLbs: 0,
      disposalCost: 0,
      laborCost: 0,
      fuelCost: 0,
      vehicleCost: 0,
      extraFees: [],
      baseCost: result.estimatedCost,
      recommendedQuote: result.total,
      finalQuote: result.total,
      grossProfitDollars: result.grossProfitDollars,
      grossMarginDecimal: result.grossMarginDecimal,
      notes: notes || undefined,
      mode,
      service: buildSnapshot(),
      serviceType: deriveServiceType(),
      crewSize: result.crewSize,
    };
    saveEstimate(estimate);
    onSaved();
    toast.success(copy.savedToast);
  };

  const customerQuoteText = () => {
    if (mode === "moving") {
      const vehicleLabel =
        movingVehicle === "box_truck" ? "Box Truck with hydraulic liftgate" : movingVehicle === "van" ? "Cargo Van" : null;
      const lines: (string | null)[] = [
        "Moving Estimate",
        "",
        `Pickup: ${pickupAddress?.trim() || "To be confirmed"}`,
        `Delivery: ${deliveryAddress?.trim() || "To be confirmed"}`,
        routeMiles != null ? `Distance: ${routeMiles.toFixed(1)} miles` : null,
        "",
        `Estimated price: ${money(result.total)}`,
        `Crew: ${result.crewSize} worker${result.crewSize > 1 ? "s" : ""}`,
        vehicleLabel ? `Vehicle: ${vehicleLabel}` : null,
        "",
        "Items:",
        ...result.lineItems.map((line) => `- ${line.name}${line.quantity > 1 ? ` x${line.quantity}` : ""}: ${money2(line.lineTotal)}`),
        pickupStairFloor !== "none"
          ? `- Stairs at pickup: ${stairFloorLabel(pickupStairFloor)} +${money2(stairRate(pickupStairFloor))}`
          : null,
        deliveryStairFloor !== "none"
          ? `- Stairs at delivery: ${stairFloorLabel(deliveryStairFloor)} +${money2(stairRate(deliveryStairFloor))}`
          : null,
        ...result.surcharges.map((line) => `- ${line.name}: ${money2(line.lineTotal)}`),
        "",
        result.photoRequired ? "Please send a few photos so we can confirm the exact price." : null,
        notes ? `Notes:\n${notes}` : null,
      ];
      return lines.filter((line) => line !== null).join("\n");
    }
    return [
      copy.quoteHeading,
      "",
      `Estimated price: ${money(result.total)}`,
      `Crew: ${result.crewSize} worker${result.crewSize > 1 ? "s" : ""}`,
      "",
      "Items:",
      ...result.lineItems.map((line) => `- ${line.name}${line.quantity > 1 ? ` x${line.quantity}` : ""}: ${money2(line.lineTotal)}`),
      result.stairSurcharge > 0 ? `- Stairs: ${money2(result.stairSurcharge)}` : "",
      ...result.surcharges.map((line) => `- ${line.name}: ${money2(line.lineTotal)}`),
      "",
      result.photoRequired ? "Please send a few photos so we can confirm the exact price." : "",
      notes ? `Notes:\n${notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="space-y-6">
        {mode === "moving" && movingVehicleNeeded && (
          <Card>
            <CardHeader>
              <CardTitle>Vehicle</CardTitle>
              <CardDescription>
                Sets the travel fee ($50 van / $75 box truck) — covers the first {FREE_ROUTE_MILES} route miles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div
                className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
                role="tablist"
                aria-label="Moving vehicle"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={movingVehicle === "van"}
                  onClick={() => setVehicleChoice("van")}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${movingVehicle === "van" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Cargo Van
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={movingVehicle === "box_truck"}
                  onClick={() => setVehicleChoice("box_truck")}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${movingVehicle === "box_truck" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Box Truck
                </button>
              </div>
              {movingVehicle === "box_truck" && (
                <p className="text-xs text-muted-foreground">Includes hydraulic liftgate at no extra charge</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{copy.itemsTitle}</CardTitle>
            <CardDescription>{copy.itemsDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value="" onValueChange={addItem}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={copy.itemPlaceholder} />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {serviceGroups.map((group) => (
                  <SelectGroup key={group.category.id}>
                    <SelectLabel>{group.category.name}</SelectLabel>
                    {group.items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} — {money2(item.price)}
                        {unitSuffix(item.priceUnit)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            {lineEntries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                {copy.emptyText}
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {result.lineItems.map((line) => (
                  <div key={line.itemId} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="truncate">{line.name}</span>
                        {line.crewSize && line.crewSize > 1 && <span className="text-xs text-amber-600">⚠️{line.crewSize}</span>}
                        {line.photoRequired && <span title="Photos required">📷</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {money2(line.unitPrice)}
                        {unitSuffix(line.priceUnit)} · {money2(line.lineTotal)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Stepper binds to the entered qty (not the billed qty) so the
                          2-hour moving clamp can't trap the value above zero. */}
                      <QtyStepper value={itemQty[line.itemId] ?? line.quantity} onChange={(qty) => setItem(line.itemId, qty)} />
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => setItem(line.itemId, 0)} aria-label={`Remove ${line.name}`}>
                        <Trash2 className="size-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stairs & Surcharges</CardTitle>
            <CardDescription>
              {mode === "moving"
                ? "Stairs are charged per location — the pickup and the delivery each count once."
                : "Stair surcharges apply per move direction (loading and unloading count separately)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === "moving" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Stairs at pickup</Label>
                  <Select value={pickupStairFloor} onValueChange={(value) => setPickupStairFloor(value as StairFloor)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {locationStairOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Stairs at delivery</Label>
                  <Select value={deliveryStairFloor} onValueChange={(value) => setDeliveryStairFloor(value as StairFloor)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {locationStairOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Stairs</Label>
                  <Select value={stairFloor} onValueChange={(value) => setStairFloor(value as StairFloor)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stairOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Directions</Label>
                  <Select value={String(stairDirections)} onValueChange={(value) => setStairDirections(Number(value) as 1 | 2)} disabled={stairFloor === "none"}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">One direction (load OR unload)</SelectItem>
                      <SelectItem value="2">Both directions (load AND unload)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <Select value="" onValueChange={addSurcharge}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Add a surcharge or fee…" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {surchargeGroups.map((group, index) => (
                  <SelectGroup key={group.category?.id ?? index}>
                    <SelectLabel>{group.category?.name ?? "Fees"}</SelectLabel>
                    {group.items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} — {item.priceNote ?? `${money2(item.price)}${unitSuffix(item.priceUnit)}`}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            {surchargeEntries.length > 0 && (
              <div className="divide-y divide-border rounded-lg border border-border">
                {/* Only manually-added surcharges — the vehicle's auto travel/mileage
                    lines live in the quote summary, not here. */}
                {result.surcharges.filter((line) => surchargeQty[line.itemId]).map((line) => (
                  <div key={line.itemId} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{line.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {line.priceUnit === "percent" ? `${line.unitPrice}% of subtotal` : `${money2(line.unitPrice)}${unitSuffix(line.priceUnit)} · ${money2(line.lineTotal)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <QtyStepper value={line.quantity} onChange={(qty) => setSurcharge(line.itemId, qty)} />
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => setSurcharge(line.itemId, 0)} aria-label={`Remove ${line.name}`}>
                        <Trash2 className="size-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>{copy.quoteTitle}</CardTitle>
                <CardDescription>{hasItems ? `${lineEntries.length} item${lineEntries.length > 1 ? "s" : ""}` : "Add items to calculate."}</CardDescription>
              </div>
              {hasItems ? <CrewBadge crewSize={result.crewSize} /> : <Badge variant="outline">Not ready</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {!hasItems ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                The quote stays clear until at least one service item is added.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Quote</p>
                    <p className="mt-1 text-2xl font-bold text-primary">{money(result.total)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Est. Profit</p>
                    <p className="mt-1 text-lg font-bold">{money(result.grossProfitDollars)}</p>
                    <p className="text-xs text-muted-foreground">{Math.round(result.grossMarginDecimal * 100)}% margin</p>
                  </div>
                </div>

                {mode === "moving" && routeMiles != null && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Route</span>
                      <span className="font-medium">
                        {routeMiles.toFixed(1)} mi
                        {route?.driveMinutes != null ? ` · ~${route.driveMinutes} min drive` : ""}
                      </span>
                    </div>
                    {excessMiles > 0 && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Travel fee covers first {FREE_ROUTE_MILES} mi — excess mileage auto-applied
                      </p>
                    )}
                  </div>
                )}

                {result.photoRequired && <PhotoRequiredBanner />}

                <Separator />

                <div className="space-y-1.5 text-sm">
                  {result.lineItems.map((line) => (
                    <div key={line.itemId} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        {line.name}
                        {line.quantity > 1 ? ` ×${line.quantity}` : ""}
                      </span>
                      <span className="font-medium">{money2(line.lineTotal)}</span>
                    </div>
                  ))}
                  {result.discountApplied && (
                    <div className="flex justify-between gap-3 text-green-700">
                      <span>Multi-item discount (−10%)</span>
                      <span className="font-medium">−{money2(result.discountAmount)}</span>
                    </div>
                  )}
                  {result.minimumApplied && (
                    <div className="flex justify-between gap-3 text-muted-foreground">
                      <span>Minimum service call applied</span>
                      <span className="font-medium">{money(result.itemsAfterDiscount)}</span>
                    </div>
                  )}
                  {mode === "moving" ? (
                    <>
                      {pickupStairFloor !== "none" && (
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Stairs at pickup ({stairFloorLabel(pickupStairFloor)})</span>
                          <span className="font-medium">{money2(stairRate(pickupStairFloor))}</span>
                        </div>
                      )}
                      {deliveryStairFloor !== "none" && (
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Stairs at delivery ({stairFloorLabel(deliveryStairFloor)})</span>
                          <span className="font-medium">{money2(stairRate(deliveryStairFloor))}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    result.stairSurcharge > 0 && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Stairs ({stairDirections} dir)</span>
                        <span className="font-medium">{money2(result.stairSurcharge)}</span>
                      </div>
                    )
                  )}
                  {result.surcharges.map((line) => (
                    <div key={line.itemId} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{line.name}</span>
                      <span className="font-medium">{money2(line.lineTotal)}</span>
                    </div>
                  ))}
                  <Separator className="my-1.5" />
                  <div className="flex justify-between gap-3 text-base font-bold">
                    <span>Total</span>
                    <span>{money(result.total)}</span>
                  </div>
                </div>

                {result.warnings.length > 0 && (
                  <div className="space-y-2">
                    {result.warnings
                      .filter((warning) => warning.code !== "photo_required")
                      .map((warning, index) => (
                        <div
                          key={`${warning.code}-${index}`}
                          className={`rounded-lg border p-3 text-sm ${
                            warning.severity === "critical"
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : warning.severity === "warning"
                                ? "border-amber-300 bg-amber-50 text-amber-900"
                                : "border-border bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          {warning.message}
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleSave} disabled={!hasItems}>
                <Save className="size-4" />
                Save
              </Button>
              <Button variant="outline" onClick={() => copyText(customerQuoteText(), "Customer quote")} disabled={!hasItems}>
                <Copy className="size-4" />
                Customer
              </Button>
              <Button variant="secondary" className="col-span-2" onClick={reset}>
                <RotateCcw className="size-4" />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
