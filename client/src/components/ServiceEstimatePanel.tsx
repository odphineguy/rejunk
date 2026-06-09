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
import { getPricebook } from "@/lib/pricebookStorage";
import { saveEstimate } from "@/utils/pricingStorage";
import { calculateServiceEstimate } from "@/utils/serviceCalculator";
import type { PricebookCategory, PricebookItem } from "@/types/pricebook";
import type { JobServiceType } from "@/types/jobs";
import type { SavedEstimate } from "@/types/pricing";
import type { ServiceEstimateSnapshot, ServiceQuoteEntry, StairFloor } from "@/types/service";

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

export interface ServiceEstimatePanelProps {
  customerName: string;
  jobAddress: string;
  notes: string;
  onSaved: () => void;
  loadSeed?: SavedEstimate | null;
}

export function ServiceEstimatePanel({ customerName, jobAddress, notes, onSaved, loadSeed }: ServiceEstimatePanelProps) {
  const [pricebook, setPricebook] = useState(() => getPricebook());
  const [itemQty, setItemQty] = useState<Record<string, number>>({});
  const [surchargeQty, setSurchargeQty] = useState<Record<string, number>>({});
  const [stairFloor, setStairFloor] = useState<StairFloor>("none");
  const [stairDirections, setStairDirections] = useState<1 | 2>(1);

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
    loadSeed.service.surcharges.forEach((line) => (seedSurcharges[line.itemId] = line.quantity));
    setItemQty(seedItems);
    setSurchargeQty(seedSurcharges);
    setStairFloor(loadSeed.service.stairFloor);
    setStairDirections(loadSeed.service.stairDirections);
  }, [loadSeed?.id]);

  const itemsById = useMemo(() => Object.fromEntries(pricebook.items.map((item) => [item.id, item])), [pricebook.items]);

  // Quotable service items (assembly/handyman/appliance/cleaning + moving), excluding fees + the auto discount.
  const serviceGroups = useMemo(() => {
    const sorted = [...pricebook.categories].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
    return sorted
      .filter((category) => category.mode === "assembly_service" || category.mode === "moving")
      .map((category) => ({
        category,
        items: pricebook.items.filter(
          (item) => item.categoryId === category.id && item.itemType !== "Fee" && item.id !== "assembly-multi-item-discount",
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [pricebook.categories, pricebook.items]);

  // Surcharge / fee items (excludes the stair items — those use the dedicated control — and the auto discount).
  const surchargeGroups = useMemo(() => {
    const fees = pricebook.items.filter(
      (item) => item.itemType === "Fee" && item.id !== "assembly-multi-item-discount" && !item.id.startsWith("surcharge-stairs-"),
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

  const result = useMemo(
    () => calculateServiceEstimate({ lineItems: lineEntries, surcharges: surchargeEntries, stairFloor, stairDirections }),
    [lineEntries, surchargeEntries, stairFloor, stairDirections],
  );

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

  const addItem = (id: string) => setItem(id, (itemQty[id] ?? 0) + 1);
  const addSurcharge = (id: string) => setSurcharge(id, (surchargeQty[id] ?? 0) + 1);

  const reset = () => {
    setItemQty({});
    setSurchargeQty({});
    setStairFloor("none");
    setStairDirections(1);
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
    const primaryName = result.lineItems[0]?.name ?? "Service";
    const estimate: SavedEstimate = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      customerName: customerName || undefined,
      jobAddress: jobAddress || undefined,
      loadLabel: "Service / Task",
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
      mode: "service",
      service: buildSnapshot(),
      serviceType: deriveServiceType(),
      crewSize: result.crewSize,
    };
    saveEstimate(estimate);
    onSaved();
    toast.success("Service estimate saved");
  };

  const customerQuoteText = () =>
    [
      "Service Estimate",
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

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Service Items</CardTitle>
            <CardDescription>Flat-rate assembly, handyman, appliance, and moving items from the Pricebook.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value="" onValueChange={addItem}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Add a service item…" />
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
                No items yet. Use the dropdown to add assembly, handyman, appliance, or moving items.
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
                      <QtyStepper value={line.quantity} onChange={(qty) => setItem(line.itemId, qty)} />
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
            <CardDescription>Stair surcharges apply per move direction (loading and unloading count separately).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                {result.surcharges.map((line) => (
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
                <CardTitle>Service Quote</CardTitle>
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
                  {result.stairSurcharge > 0 && (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Stairs ({stairDirections} dir)</span>
                      <span className="font-medium">{money2(result.stairSurcharge)}</span>
                    </div>
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
