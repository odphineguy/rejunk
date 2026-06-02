import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, Briefcase, Calculator, Copy, CopyPlus, Printer, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { defaultPricingSettings } from "@/data/defaultPricing";
import { calculateEstimate, findVolumeBenchmark } from "@/utils/pricingCalculator";
import { deleteSavedEstimate, loadPricingSettings, loadSavedEstimates, saveEstimate } from "@/utils/pricingStorage";
import { materialIcon } from "@/lib/materialIcons";
import { createJobFromEstimate, getJobByEstimateId } from "@/lib/jobStorage";
import type { EstimateWarning, ExtraFee, SavedEstimate } from "@/types/pricing";

const loadOptions = [
  { label: "Minimum", value: "0" },
  { label: "1/8 Load", value: String(1 / 8) },
  { label: "1/6 Load", value: String(1 / 6) },
  { label: "1/4 Load", value: String(1 / 4) },
  { label: "1/3 Load", value: String(1 / 3) },
  { label: "3/8 Load", value: String(3 / 8) },
  { label: "1/2 Load", value: String(1 / 2) },
  { label: "5/8 Load", value: String(5 / 8) },
  { label: "2/3 Load", value: String(2 / 3) },
  { label: "3/4 Load", value: String(3 / 4) },
  { label: "7/8 Load", value: String(7 / 8) },
  { label: "Full Load", value: "1" },
];

const starterExtraFees: ExtraFee[] = [
  { id: "stairs", name: "Stairs fee", amount: 0 },
  { id: "appliance", name: "Appliance fee", amount: 0 },
  { id: "mattress", name: "Mattress fee", amount: 0 },
  { id: "tire", name: "Tire fee", amount: 0 },
  { id: "long-carry", name: "Long carry fee", amount: 0 },
  { id: "custom", name: "Custom fee", amount: 0 },
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function money(value: number | undefined) {
  return currency.format(Number.isFinite(value) ? Number(value) : 0);
}

function numericValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function estimateId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `estimate-${Date.now()}`;
}

function quoteRange(finalQuote: number) {
  const lower = Math.max(0, Math.round((finalQuote * 0.9) / 25) * 25);
  const upper = Math.round((finalQuote * 1.1) / 25) * 25;
  return { lower, upper };
}

function initialFacilityId(fallbackId: string) {
  if (typeof window === "undefined") {
    return fallbackId;
  }

  return new URLSearchParams(window.location.search).get("facilityId") || fallbackId;
}

function warningStatus(warnings: EstimateWarning[]) {
  if (warnings.some((warning) => warning.code === "payload_exceeded")) return "Payload Exceeded";
  if (warnings.some((warning) => warning.code === "facility_rejects_material")) return "Facility Mismatch";
  if (warnings.some((warning) => warning.code === "facility_not_verified_recently")) return "Pricing Stale";
  if (warnings.some((warning) => warning.code === "heavy_material")) return "Heavy Material";
  return "OK";
}

function warningLabel(warning: EstimateWarning) {
  switch (warning.code) {
    case "payload_exceeded":
      return "Payload Exceeded";
    case "heavy_material":
      return "Heavy Material";
    case "facility_rejects_material":
      return "Facility Mismatch";
    case "facility_not_verified_recently":
      return "Pricing Stale";
    case "multiple_trips_likely":
      return "Multiple Trips";
    case "margin_below_target":
      return "Margin Check";
    case "payload_near_limit":
      return "Near Payload";
    default:
      return "Warning";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "strong" | "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone === "danger" ? "text-destructive" : ""} ${tone === "strong" ? "text-primary" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ warnings }: { warnings: EstimateWarning[] }) {
  const status = warningStatus(warnings);
  const isCritical = status === "Payload Exceeded" || status === "Facility Mismatch";
  const isWarning = status !== "OK" && !isCritical;

  return (
    <Badge variant={status === "OK" ? "secondary" : "default"} className={isCritical ? "bg-destructive text-white" : isWarning ? "bg-amber-600 text-white" : ""}>
      {status}
    </Badge>
  );
}

function WarningList({ warnings }: { warnings: EstimateWarning[] }) {
  if (warnings.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
        <div className="font-semibold">OK</div>
        <div>No pricing warnings for the current inputs.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {warnings.map((warning, index) => (
        <div
          key={`${warning.code}-${index}`}
          className={`rounded-lg border p-3 text-sm ${
            warning.severity === "critical"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 shrink-0" />
            {warningLabel(warning)}
          </div>
          <div>{warning.message}</div>
        </div>
      ))}
    </div>
  );
}

function resultDependencyExtraFees(extraFees: ExtraFee[]) {
  return extraFees.map((fee) => `${fee.id}:${fee.name}:${fee.amount}`).join("|");
}

function mergeSavedExtraFees(savedFees: ExtraFee[]) {
  const starterIds = new Set(starterExtraFees.map((fee) => fee.id));
  const starterWithSavedAmounts = starterExtraFees.map((starterFee) => savedFees.find((fee) => fee.id === starterFee.id) ?? starterFee);
  return [...starterWithSavedAmounts, ...savedFees.filter((fee) => !starterIds.has(fee.id))];
}

export default function EstimateBuilder() {
  const [, navigate] = useLocation();
  const [settings, setSettings] = useState(() => loadPricingSettings());
  const activeFacilities = settings.disposalFacilities.filter((facility) => facility.isActive);
  const activeVehicles = settings.vehicles.filter((vehicle) => vehicle.isActive);
  const activeMaterials = settings.materialPricingRules.filter((material) => material.isActive !== false);
  const defaultFacilityId = activeFacilities.find((facility) => facility.isDefault)?.id ?? activeFacilities[0]?.id ?? "";

  const [customerName, setCustomerName] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [materialId, setMaterialId] = useState(activeMaterials[0]?.id ?? "");
  const [vehicleId, setVehicleId] = useState(activeVehicles.find((vehicle) => vehicle.isDefault)?.id ?? activeVehicles[0]?.id ?? "");
  const [facilityId, setFacilityId] = useState(initialFacilityId(defaultFacilityId));
  const [loadFraction, setLoadFraction] = useState("0.5");
  const [manualCubicYards, setManualCubicYards] = useState("");
  const [manualWeightLbs, setManualWeightLbs] = useState("");
  const [workers, setWorkers] = useState(String(settings.defaults.workers));
  const [estimatedHours, setEstimatedHours] = useState(String(settings.defaults.estimatedHours));
  const [hourlyLaborCost, setHourlyLaborCost] = useState(String(settings.defaults.hourlyLaborCost));
  const [roundTripMiles, setRoundTripMiles] = useState("20");
  const [mpg, setMpg] = useState("");
  const [fuelPrice, setFuelPrice] = useState(String(settings.defaults.fuelPricePerGallon));
  const [targetMargin, setTargetMargin] = useState(String(settings.defaults.targetMarginDecimal * 100));
  const [minimumProfit, setMinimumProfit] = useState(String(settings.defaults.minimumProfitDollars));
  const [extraFees, setExtraFees] = useState<ExtraFee[]>(starterExtraFees);
  const [savedEstimates, setSavedEstimates] = useState<SavedEstimate[]>(() => loadSavedEstimates());
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);

  useEffect(() => {
    const refreshSettings = () => {
      setSettings(loadPricingSettings());
      setSavedEstimates(loadSavedEstimates());
    };

    window.addEventListener("focus", refreshSettings);
    window.addEventListener("pricing-settings-updated", refreshSettings);

    return () => {
      window.removeEventListener("focus", refreshSettings);
      window.removeEventListener("pricing-settings-updated", refreshSettings);
    };
  }, []);

  const materialRule = activeMaterials.find((material) => material.id === materialId) ?? activeMaterials[0] ?? defaultPricingSettings.materialPricingRules[0];
  const vehicle = activeVehicles.find((item) => item.id === vehicleId) ?? activeVehicles[0] ?? defaultPricingSettings.vehicles[0];
  const facility = activeFacilities.find((item) => item.id === facilityId) ?? activeFacilities[0] ?? defaultPricingSettings.disposalFacilities[0];

  const selectedLoadFraction = numericValue(loadFraction);
  const volumeBenchmark = findVolumeBenchmark(settings.volumePricingBenchmarks, selectedLoadFraction);
  const cubicYards = manualCubicYards ? numericValue(manualCubicYards) : undefined;
  const calculatedCubicYards = cubicYards ?? vehicle.usableCubicYards * selectedLoadFraction;
  const selectedExtraFees = extraFees.filter((fee) => fee.amount > 0);

  const result = useMemo(
    () =>
      calculateEstimate({
        materialRule,
        vehicle,
        facility,
        loadFraction: selectedLoadFraction,
        cubicYards,
        manualWeightLbs: manualWeightLbs ? numericValue(manualWeightLbs) : undefined,
        workers: numericValue(workers),
        estimatedHours: numericValue(estimatedHours),
        hourlyLaborCost: numericValue(hourlyLaborCost),
        roundTripMiles: numericValue(roundTripMiles),
        fuelPricePerGallon: numericValue(fuelPrice),
        mpg: mpg ? numericValue(mpg) : undefined,
        extraFees: selectedExtraFees,
        targetMarginDecimal: numericValue(targetMargin) / 100,
        minimumProfitDollars: numericValue(minimumProfit),
        volumeBenchmarkPrice: volumeBenchmark?.price,
      }),
    [
      cubicYards,
      estimatedHours,
      facility,
      fuelPrice,
      hourlyLaborCost,
      manualWeightLbs,
      materialRule,
      minimumProfit,
      mpg,
      resultDependencyExtraFees(extraFees),
      roundTripMiles,
      selectedLoadFraction,
      targetMargin,
      vehicle,
      volumeBenchmark?.price,
      workers,
    ],
  );

  const uiWarnings = useMemo(() => {
    const warnings = [...result.warnings];
    if (result.grossMarginDecimal + 0.005 < numericValue(targetMargin) / 100) {
      warnings.push({
        code: "margin_below_target",
        severity: "warning",
        message: "Quote margin is below the selected target. Raise price or revisit cost assumptions.",
      });
    }
    return warnings;
  }, [result, targetMargin]);

  const range = quoteRange(result.finalRecommendedQuote);
  const selectedLoadLabel = loadOptions.find((option) => option.value === loadFraction)?.label ?? "Manual load";
  const selectedSavedEstimate = savedEstimates.find((estimate) => estimate.id === selectedSavedId) ?? null;
  const selectedEstimateJob = selectedSavedEstimate ? getJobByEstimateId(selectedSavedEstimate.id) : null;

  const resetForm = () => {
    setCustomerName("");
    setJobAddress("");
    setNotes("");
    setMaterialId(activeMaterials[0]?.id ?? "");
    setVehicleId(activeVehicles.find((item) => item.isDefault)?.id ?? activeVehicles[0]?.id ?? "");
    setFacilityId(activeFacilities.find((item) => item.isDefault)?.id ?? activeFacilities[0]?.id ?? "");
    setLoadFraction("0.5");
    setManualCubicYards("");
    setManualWeightLbs("");
    setWorkers(String(settings.defaults.workers));
    setEstimatedHours(String(settings.defaults.estimatedHours));
    setHourlyLaborCost(String(settings.defaults.hourlyLaborCost));
    setRoundTripMiles("20");
    setMpg("");
    setFuelPrice(String(settings.defaults.fuelPricePerGallon));
    setTargetMargin(String(settings.defaults.targetMarginDecimal * 100));
    setMinimumProfit(String(settings.defaults.minimumProfitDollars));
    setExtraFees(starterExtraFees);
  };

  const customerQuoteText = () =>
    [
      "Junk Removal Estimate",
      "",
      `Estimated price: ${money(result.finalRecommendedQuote)}`,
      `Estimated load size: ${selectedLoadLabel}`,
      `Material: ${materialRule.materialName}`,
      "",
      "Includes:",
      "- Labor",
      "- Loading",
      "- Haul-away",
      "- Standard disposal",
      "",
      notes ? `Notes:\n${notes}\n` : "",
      "Final price may change if the load contains heavy materials, restricted items, extra labor, or significantly more volume than shown.",
    ]
      .join("\n");

  const internalBreakdownText = () =>
    [
      "Internal Estimate Breakdown",
      "",
      `Recommended quote: ${money(result.finalRecommendedQuote)}`,
      `Minimum quote: ${money(result.minimumQuote)}`,
      `Base cost: ${money(result.baseCost)}`,
      `Labor cost: ${money(result.laborCost)}`,
      `Disposal cost: ${money(result.disposalCost)}`,
      `Fuel cost: ${money(result.fuelCost)}`,
      `Vehicle cost: ${money(result.vehicleCost)}`,
      `Extra fees: ${money(result.extraFeesTotal)}`,
      `Gross profit: ${money(result.grossProfitDollars)}`,
      `Gross margin: ${Math.round(result.grossMarginDecimal * 100)}%`,
      "",
      `Material type: ${materialRule.materialName}`,
      `Cubic yards: ${numberFormatter.format(result.cubicYards)}`,
      `Estimated weight: ${Math.round(result.estimatedWeightLbs).toLocaleString()} lb`,
      `Estimated tons: ${result.estimatedTons.toFixed(2)}`,
      `Selected vehicle: ${vehicle.vehicleName}`,
      `Selected facility: ${facility.facilityName}`,
      `Warnings: ${uiWarnings.length ? uiWarnings.map((warning) => warningLabel(warning)).join(", ") : "None"}`,
      notes ? `Notes: ${notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const buildSavedEstimate = (overrides?: Partial<SavedEstimate>): SavedEstimate => {
    const now = new Date().toISOString();
    return {
      id: estimateId(),
      createdAt: now,
      updatedAt: now,
      customerName: customerName || undefined,
      jobAddress: jobAddress || undefined,
      loadLabel: selectedLoadLabel,
      loadFraction: selectedLoadFraction,
      materialName: materialRule.materialName,
      materialType: materialRule.materialCategory,
      materialRuleId: materialRule.id,
      vehicleName: vehicle.vehicleName,
      vehicleId: vehicle.id,
      facilityName: facility.facilityName,
      facilityId: facility.id,
      cubicYards: result.cubicYards,
      manualCubicYards: cubicYards,
      manualWeightLbs: manualWeightLbs ? numericValue(manualWeightLbs) : undefined,
      estimatedWeightLbs: result.estimatedWeightLbs,
      estimatedTons: result.estimatedTons,
      disposalCost: result.disposalCost,
      laborCost: result.laborCost,
      fuelCost: result.fuelCost,
      vehicleCost: result.vehicleCost,
      extraFees: selectedExtraFees,
      extraFeesTotal: result.extraFeesTotal,
      baseCost: result.baseCost,
      minimumQuote: result.minimumQuote,
      recommendedQuote: result.recommendedQuote,
      quoteRangeLower: range.lower,
      quoteRangeUpper: range.upper,
      finalQuote: result.finalRecommendedQuote,
      grossProfitDollars: result.grossProfitDollars,
      grossMarginDecimal: result.grossMarginDecimal,
      payloadStatus: result.payloadStatus,
      warnings: uiWarnings,
      workers: numericValue(workers),
      estimatedHours: numericValue(estimatedHours),
      hourlyLaborCost: numericValue(hourlyLaborCost),
      roundTripMiles: numericValue(roundTripMiles),
      mpg: mpg ? numericValue(mpg) : undefined,
      fuelPricePerGallon: numericValue(fuelPrice),
      targetMarginDecimal: numericValue(targetMargin) / 100,
      minimumProfitDollars: numericValue(minimumProfit),
      notes: notes || undefined,
      ...overrides,
    };
  };

  const handleSaveEstimate = () => {
    const saved = saveEstimate(buildSavedEstimate());
    setSavedEstimates((current) => [saved, ...current.filter((estimate) => estimate.id !== saved.id)]);
    setSelectedSavedId(saved.id);
    toast.success("Estimate saved locally");
  };

  const loadSavedIntoBuilder = (estimate: SavedEstimate) => {
    const material = activeMaterials.find((item) => item.id === estimate.materialRuleId) ?? activeMaterials.find((item) => item.materialCategory === estimate.materialType);
    setCustomerName(estimate.customerName ?? "");
    setJobAddress(estimate.jobAddress ?? "");
    setNotes(estimate.notes ?? "");
    setMaterialId(material?.id ?? activeMaterials[0]?.id ?? "");
    setVehicleId(estimate.vehicleId);
    setFacilityId(estimate.facilityId);
    setLoadFraction(String(estimate.loadFraction ?? 0.5));
    setManualCubicYards(String(estimate.manualCubicYards ?? estimate.cubicYards ?? ""));
    setManualWeightLbs(estimate.manualWeightLbs ? String(estimate.manualWeightLbs) : "");
    setWorkers(String(estimate.workers ?? settings.defaults.workers));
    setEstimatedHours(String(estimate.estimatedHours ?? settings.defaults.estimatedHours));
    setHourlyLaborCost(String(estimate.hourlyLaborCost ?? settings.defaults.hourlyLaborCost));
    setRoundTripMiles(String(estimate.roundTripMiles ?? 20));
    setMpg(estimate.mpg ? String(estimate.mpg) : "");
    setFuelPrice(String(estimate.fuelPricePerGallon ?? settings.defaults.fuelPricePerGallon));
    setTargetMargin(String((estimate.targetMarginDecimal ?? settings.defaults.targetMarginDecimal) * 100));
    setMinimumProfit(String(estimate.minimumProfitDollars ?? settings.defaults.minimumProfitDollars));
    setExtraFees(estimate.extraFees.length ? mergeSavedExtraFees(estimate.extraFees) : starterExtraFees);
    toast.success("Estimate loaded into builder");
  };

  const duplicateEstimate = (estimate: SavedEstimate) => {
    const now = new Date().toISOString();
    const duplicate = saveEstimate({
      ...estimate,
      id: estimateId(),
      createdAt: now,
      updatedAt: now,
      customerName: estimate.customerName ? `${estimate.customerName} copy` : "Duplicated estimate",
    });
    setSavedEstimates((current) => [duplicate, ...current]);
    setSelectedSavedId(duplicate.id);
    toast.success("Estimate duplicated");
  };

  const removeEstimate = (estimateIdToDelete: string) => {
    const next = deleteSavedEstimate(estimateIdToDelete);
    setSavedEstimates(next);
    setSelectedSavedId(null);
    toast.success("Estimate deleted");
  };

  const convertEstimateToJob = (estimate: SavedEstimate) => {
    const job = createJobFromEstimate(estimate);
    toast.success("Estimate converted to job");
    navigate(`/jobs/${job.id}`);
  };

  const printQuote = () => {
    const printWindow = window.open("", "_blank", "width=720,height=900");
    if (!printWindow) {
      toast.error("Pop-up blocked. Allow pop-ups to print the quote.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Junk Removal Estimate</title>
          <style>
            body { font-family: Arial, sans-serif; color: #222; margin: 40px; line-height: 1.45; }
            h1 { margin: 0 0 20px; }
            .price { font-size: 34px; font-weight: 700; margin: 12px 0; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 24px 0; }
            .box { border: 1px solid #ddd; border-radius: 8px; padding: 14px; }
            ul { padding-left: 20px; }
            .fine { color: #555; margin-top: 28px; }
          </style>
        </head>
        <body>
          <h1>Junk Removal Estimate</h1>
          <div class="price">${money(result.finalRecommendedQuote)}</div>
          <p>Quote range: ${money(range.lower)} - ${money(range.upper)}</p>
          <div class="meta">
            <div class="box"><strong>Customer</strong><br>${customerName || "Not provided"}</div>
            <div class="box"><strong>Job Address</strong><br>${jobAddress || "Not provided"}</div>
            <div class="box"><strong>Load Size</strong><br>${selectedLoadLabel}</div>
            <div class="box"><strong>Material</strong><br>${materialRule.materialName}</div>
          </div>
          <h2>Includes</h2>
          <ul>
            <li>Labor</li>
            <li>Loading</li>
            <li>Haul-away</li>
            <li>Standard disposal</li>
          </ul>
          ${notes ? `<h2>Notes</h2><p>${notes.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>` : ""}
          <p class="fine">Final price may change if the load contains heavy materials, restricted items, extra labor, or significantly more volume than shown.</p>
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background px-4 py-5 md:px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calculator className="size-4" />
          Internal pricing tool
        </div>
        <h1 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">Estimate Builder</h1>
        <p className="mt-1 text-muted-foreground">Build weight-aware junk removal quotes with payload and disposal checks.</p>
      </header>

      <main className="px-4 py-6 md:px-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Job Info</CardTitle>
                <CardDescription>Optional customer context for saved estimates and copy-ready output.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Field label="Customer name">
                  <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Optional" />
                </Field>
                <Field label="Job address">
                  <Input value={jobAddress} onChange={(event) => setJobAddress(event.target.value)} placeholder="Optional" />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Notes">
                    <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Access notes, exclusions, special handling..." />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Load & Material</CardTitle>
                <CardDescription>Heavy materials use weight-aware pricing and trigger payload warnings.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Material type">
                  <Select value={materialId} onValueChange={setMaterialId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activeMaterials.map((material) => {
                        const icon = materialIcon(material.materialCategory);
                        return (
                          <SelectItem key={material.id} value={material.id}>
                            <span className="flex items-center gap-2">
                              {icon && <img src={icon.src} alt="" className="h-4 w-4 object-contain" />}
                              {material.materialName}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Vehicle">
                  <Select value={vehicleId} onValueChange={setVehicleId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activeVehicles.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.vehicleName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Load size">
                  <Select value={loadFraction} onValueChange={setLoadFraction}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {loadOptions.map((option) => (
                        <SelectItem key={option.label} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Manual cubic yards">
                  <Input type="number" min="0" step="0.1" value={manualCubicYards} onChange={(event) => setManualCubicYards(event.target.value)} placeholder={numberFormatter.format(calculatedCubicYards)} />
                </Field>
                <Field label="Manual weight override (lb)">
                  <Input type="number" min="0" step="25" value={manualWeightLbs} onChange={(event) => setManualWeightLbs(event.target.value)} placeholder={String(Math.round(calculatedCubicYards * materialRule.defaultDensityLbsPerYard))} />
                </Field>
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vehicle capacity</p>
                  <p className="mt-1 text-sm font-semibold">{vehicle.usableCubicYards} yd3 usable / {vehicle.maxPayloadLbs.toLocaleString()} lb payload</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Disposal, Labor & Fuel</CardTitle>
                <CardDescription>Choose the facility and operating assumptions for the quote.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Disposal facility">
                  <Select value={facilityId} onValueChange={setFacilityId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activeFacilities.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.facilityName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Workers">
                  <Input type="number" min="1" step="1" value={workers} onChange={(event) => setWorkers(event.target.value)} />
                </Field>
                <Field label="Labor hours">
                  <Input type="number" min="0" step="0.25" value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} />
                </Field>
                <Field label="Hourly labor cost">
                  <Input type="number" min="0" step="1" value={hourlyLaborCost} onChange={(event) => setHourlyLaborCost(event.target.value)} />
                </Field>
                <Field label="Round trip miles">
                  <Input type="number" min="0" step="1" value={roundTripMiles} onChange={(event) => setRoundTripMiles(event.target.value)} />
                </Field>
                <Field label="MPG">
                  <Input type="number" min="1" step="0.5" value={mpg} onChange={(event) => setMpg(event.target.value)} placeholder={String(vehicle.mpgLoaded)} />
                </Field>
                <Field label="Gas price">
                  <Input type="number" min="0" step="0.01" value={fuelPrice} onChange={(event) => setFuelPrice(event.target.value)} />
                </Field>
                <Field label="Target margin %">
                  <Input type="number" min="0" max="95" step="1" value={targetMargin} onChange={(event) => setTargetMargin(event.target.value)} />
                </Field>
                <Field label="Minimum profit">
                  <Input type="number" min="0" step="25" value={minimumProfit} onChange={(event) => setMinimumProfit(event.target.value)} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Extra Fees</CardTitle>
                <CardDescription>Add job-specific fees that should be included in base cost.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {extraFees.map((fee, index) => (
                  <div key={fee.id} className="grid grid-cols-[1fr_120px] gap-2">
                    <Input
                      value={fee.name}
                      onChange={(event) =>
                        setExtraFees((current) =>
                          current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)),
                        )
                      }
                    />
                    <Input
                      type="number"
                      min="0"
                      step="5"
                      value={fee.amount}
                      onChange={(event) =>
                        setExtraFees((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, amount: numericValue(event.target.value) } : item,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Card className="border-primary/30">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Quote Summary</CardTitle>
                    <CardDescription>{materialRule.materialName} via {facility.facilityName}</CardDescription>
                  </div>
                  <StatusBadge warnings={uiWarnings} />
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Recommended" value={money(result.finalRecommendedQuote)} tone="strong" />
                  <Stat label="Minimum quote" value={money(result.minimumQuote)} />
                  <Stat label="Quote range" value={`${money(range.lower)}-${money(range.upper)}`} />
                  <Stat label="Base cost" value={money(result.baseCost)} />
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Labor" value={money(result.laborCost)} />
                  <Stat label="Disposal" value={money(result.disposalCost)} />
                  <Stat label="Fuel" value={money(result.fuelCost)} />
                  <Stat label="Vehicle" value={money(result.vehicleCost)} />
                  <Stat label="Extra fees" value={money(result.extraFeesTotal)} />
                  <Stat label="Gross profit" value={money(result.grossProfitDollars)} tone="strong" />
                </div>

                <div className="rounded-lg border border-border p-4 text-sm">
                  <div className="grid gap-2">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Gross margin</span>
                      <span className="font-semibold">{Math.round(result.grossMarginDecimal * 100)}%</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Estimated weight</span>
                      <span className="font-semibold">{Math.round(result.estimatedWeightLbs).toLocaleString()} lb</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Estimated tons</span>
                      <span className="font-semibold">{result.estimatedTons.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Cubic yards</span>
                      <span className="font-semibold">{numberFormatter.format(result.cubicYards)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Payload status</span>
                      <span className="font-semibold capitalize">{result.payloadStatus.replace("_", " ")}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Facility</span>
                      <span className="text-right font-semibold">{facility.facilityName}</span>
                    </div>
                  </div>
                </div>

                <WarningList warnings={uiWarnings} />

                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={handleSaveEstimate}>
                    <Save className="size-4" />
                    Save
                  </Button>
                  <Button variant="outline" onClick={() => copyText(customerQuoteText(), "Customer quote")}>
                    <Copy className="size-4" />
                    Customer
                  </Button>
                  <Button variant="outline" onClick={() => copyText(internalBreakdownText(), "Internal breakdown")}>
                    <Copy className="size-4" />
                    Internal
                  </Button>
                  <Button variant="outline" onClick={printQuote}>
                    <Printer className="size-4" />
                    Print
                  </Button>
                  <Button variant="secondary" className="col-span-2" onClick={resetForm}>
                    <RotateCcw className="size-4" />
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Saved Estimates</CardTitle>
                <CardDescription>{savedEstimates.length} saved locally in this browser.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {savedEstimates.slice(0, 8).map((estimate) => (
                  <button
                    key={estimate.id}
                    onClick={() => setSelectedSavedId(estimate.id)}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                      selectedSavedId === estimate.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{estimate.customerName || estimate.jobAddress || "Unnamed estimate"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {estimate.materialName || estimate.materialType.replaceAll("_", " ")} · {new Date(estimate.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-primary">{money(estimate.finalQuote)}</div>
                        {estimate.warnings?.length ? <StatusBadge warnings={estimate.warnings} /> : null}
                      </div>
                    </div>
                  </button>
                ))}
                {savedEstimates.length === 0 && <p className="text-sm text-muted-foreground">No saved estimates yet.</p>}
              </CardContent>
            </Card>

            {selectedSavedEstimate && (
              <SavedEstimateDetail
                estimate={selectedSavedEstimate}
                convertedJobId={selectedEstimateJob?.id}
                onLoad={() => loadSavedIntoBuilder(selectedSavedEstimate)}
                onDuplicate={() => duplicateEstimate(selectedSavedEstimate)}
                onDelete={() => removeEstimate(selectedSavedEstimate.id)}
                onConvert={() => convertEstimateToJob(selectedSavedEstimate)}
              />
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function SavedEstimateDetail({
  estimate,
  convertedJobId,
  onLoad,
  onDuplicate,
  onDelete,
  onConvert,
}: {
  estimate: SavedEstimate;
  convertedJobId?: string;
  onLoad: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onConvert: () => void;
}) {
  const estimateRange = {
    lower: estimate.quoteRangeLower ?? quoteRange(estimate.finalQuote).lower,
    upper: estimate.quoteRangeUpper ?? quoteRange(estimate.finalQuote).upper,
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Saved Detail</CardTitle>
            <CardDescription>{new Date(estimate.createdAt).toLocaleString()}</CardDescription>
          </div>
          <StatusBadge warnings={estimate.warnings ?? []} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Quote" value={money(estimate.finalQuote)} tone="strong" />
          <Stat label="Range" value={`${money(estimateRange.lower)}-${money(estimateRange.upper)}`} />
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="grid gap-2">
            <DetailRow label="Customer" value={estimate.customerName || "Not provided"} />
            <DetailRow label="Job" value={estimate.jobAddress || "Not provided"} />
            <DetailRow label="Material" value={estimate.materialName || estimate.materialType.replaceAll("_", " ")} />
            <DetailRow label="Vehicle" value={estimate.vehicleName || estimate.vehicleId} />
            <DetailRow label="Facility" value={estimate.facilityName || estimate.facilityId} />
            <DetailRow label="Cubic yards" value={numberFormatter.format(estimate.cubicYards)} />
            <DetailRow label="Weight" value={`${Math.round(estimate.estimatedWeightLbs).toLocaleString()} lb`} />
            <DetailRow label="Tons" value={(estimate.estimatedTons ?? estimate.estimatedWeightLbs / 2000).toFixed(2)} />
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="grid gap-2">
            <DetailRow label="Base cost" value={money(estimate.baseCost)} />
            <DetailRow label="Labor" value={money(estimate.laborCost)} />
            <DetailRow label="Disposal" value={money(estimate.disposalCost)} />
            <DetailRow label="Fuel" value={money(estimate.fuelCost)} />
            <DetailRow label="Vehicle" value={money(estimate.vehicleCost)} />
            <DetailRow label="Extra fees" value={money(estimate.extraFeesTotal ?? estimate.extraFees.reduce((total, fee) => total + fee.amount, 0))} />
            <DetailRow label="Gross profit" value={money(estimate.grossProfitDollars ?? estimate.finalQuote - estimate.baseCost)} />
            <DetailRow label="Gross margin" value={`${Math.round((estimate.grossMarginDecimal ?? (estimate.finalQuote - estimate.baseCost) / estimate.finalQuote) * 100)}%`} />
          </div>
        </div>

        <WarningList warnings={estimate.warnings ?? []} />

        {estimate.notes && (
          <div className="rounded-lg border border-border p-4">
            <div className="mb-1 font-semibold">Notes</div>
            <p className="text-muted-foreground">{estimate.notes}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {convertedJobId ? (
            <Button className="col-span-2" asChild>
              <Link href={`/jobs/${convertedJobId}`}>
                <Briefcase className="size-4" />
                Open Job
              </Link>
            </Button>
          ) : (
            <Button className="col-span-2" onClick={onConvert}>
              <Briefcase className="size-4" />
              Convert to Job
            </Button>
          )}
          <Button onClick={onLoad}>Load</Button>
          <Button variant="outline" onClick={onDuplicate}>
            <CopyPlus className="size-4" />
            Duplicate
          </Button>
          <Button variant="destructive" className="col-span-2" onClick={onDelete}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}
