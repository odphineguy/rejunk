import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  FileDown,
  Info,
  Minus,
  Plus,
  RotateCcw,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { loadMapScript } from "@/components/Map";
import { useStaffSession } from "@/hooks/useStaffSession";
import { ASSEMBLY_SKUS, MOVING_RATES, dayTypeOf, shortDateLabel } from "@/data/movingRates";
import {
  CREW_SIZES,
  calculateMovingQuote,
  customerTextFor,
  defaultMovingInput,
  homeSizeLabel,
  packingBreakdown,
} from "@/utils/movingCalculator";
import { getPointToPointRoute } from "@/utils/distanceRouting";
import { saveEstimateConfirmed } from "@/utils/pricingStorage";
import { downloadQuotePdf, type QuotePdfLine } from "@/utils/quotePdf";
import type { SavedEstimate } from "@/types/pricing";
import type { StairFloor } from "@/types/service";
import type {
  CrewSize,
  DayType,
  HomeSize,
  MovingEstimateSnapshot,
  MovingQuoteInput,
  MovingQuoteResult,
  MovingWarning,
  PianoType,
} from "@/types/moving";

// ── Formatting ──────────────────────────────────────────────────────────────

const currency0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const currency2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function money(value: number | undefined) {
  return currency0.format(Number.isFinite(value) ? Number(value) : 0);
}
function money2(value: number | undefined) {
  return currency2.format(Number.isFinite(value) ? Number(value) : 0);
}
function rangeText(low: number, high: number, fmt = money) {
  return low === high ? fmt(low) : `${fmt(low)}–${fmt(high)}`;
}
function hoursText(low: number, high: number) {
  const f = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  return low === high ? `${f(low)} hrs` : `${f(low)}–${f(high)} hrs`;
}
function numeric(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `estimate-${Date.now()}`;
}

const ESTIMATE_DISCLAIMER =
  "This is an estimate, not a fixed price — you only pay for the time we actually work, billed in quarter hours after the minimum. " +
  "The final price may change if the move involves noticeably more items, stairs, or access issues than described.";

// ── Option catalogs ─────────────────────────────────────────────────────────

const HOME_SIZES: { value: HomeSize; label: string }[] = [
  { value: "few_items", label: "Few items (≤8)" },
  { value: "studio_1br", label: "Studio / 1BR" },
  { value: "2br", label: "2BR" },
  { value: "3br", label: "3BR" },
  { value: "4br", label: "4BR" },
  { value: "5br_plus", label: "5BR+" },
];

const PIANOS: { value: PianoType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "upright", label: "Upright" },
  { value: "large_upright", label: "Large upright" },
  { value: "baby_grand", label: "Baby grand" },
  { value: "grand", label: "Grand" },
];

const WALKTHROUGH_ITEMS: { key: string; label: string }[] = [
  { key: "rooms", label: "Rooms and what's in each" },
  { key: "furniture", label: "Furniture list (beds, sofas, tables, shelving)" },
  { key: "boxes", label: "Box count by size (small for books/toys, medium, large, dish pack, wardrobe)" },
  { key: "stays", label: "What stays behind" },
  { key: "stairs", label: "Stairs / elevator at each address" },
  { key: "parking", label: "Truck parking and access at each address" },
  { key: "specialty", label: "Specialty items (piano, safe, play structure, appliances)" },
  { key: "tvs", label: "TVs on walls" },
  { key: "garage", label: "Garage / shed contents" },
  { key: "dates", label: "Date flexibility" },
];

const STAIR_FLOOR_FLIGHTS: Record<StairFloor, number> = { none: 0, "2nd": 1, "3rd": 2, above_3rd: 3 };

// ── Small building blocks ───────────────────────────────────────────────────

function Section({ number, title, hint, children }: { number: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 py-5 first:pt-0 last:pb-0">
      <div className="flex items-baseline gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-[var(--moss-deep)] text-[11px] font-bold text-white">{number}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string; badge?: string; disabled?: boolean; title?: string }[];
  onChange: (next: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-1" role="tablist" aria-label={label}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`rounded-md font-medium transition-colors ${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${
              selected ? "bg-[var(--moss-deep)] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            } ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {option.label}
            {option.badge && (
              <span className={`ml-1.5 rounded px-1 text-[10px] ${selected ? "bg-white/20" : "bg-[var(--moss-deep)]/15 text-[var(--moss-deep)]"}`}>{option.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Stepper({ value, onChange, min = 0, max = 99, label }: { value: number; onChange: (next: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Decrease ${label}`} disabled={value <= min}>
        <Minus className="size-3" />
      </Button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
      <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Increase ${label}`} disabled={value >= max}>
        <Plus className="size-3" />
      </Button>
    </div>
  );
}

function DayChip({ dayType, label }: { dayType: DayType; label?: string }) {
  return (
    <Badge variant="outline" className={dayType === "weekend" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-[var(--moss-deep)]/40 bg-[var(--moss-deep)]/10 text-[var(--moss-deep)]"}>
      {label ? `${label} · ` : ""}
      {dayType}
    </Badge>
  );
}

function CheckRow({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={next => onChange(next === true)} />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
        {hint && <span className="ml-1 text-xs text-muted-foreground">{hint}</span>}
      </Label>
    </div>
  );
}

function SwitchRow({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
        {hint && <span className="ml-1 text-xs text-muted-foreground">{hint}</span>}
      </Label>
    </div>
  );
}

function WarningBanners({ warnings }: { warnings: MovingWarning[] }) {
  if (warnings.length === 0) return null;
  const order: Record<MovingWarning["severity"], number> = { escalate: 0, warning: 1, info: 2 };
  const sorted = [...warnings].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div className="space-y-2">
      {sorted.map((warning, index) => (
        <div
          key={`${warning.code}-${index}`}
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
            warning.severity === "escalate"
              ? "border-amber-300 bg-amber-50 font-medium text-amber-900"
              : warning.severity === "warning"
                ? "border-border bg-muted/40 text-foreground"
                : "border-border bg-muted/20 text-muted-foreground"
          }`}
        >
          {warning.severity === "escalate" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
          <span>
            {warning.severity === "escalate" && <span className="mr-1 uppercase tracking-wide text-[10px]">Escalate ·</span>}
            {warning.message}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Quote-side pieces ───────────────────────────────────────────────────────

function selectedOptionName(result: MovingQuoteResult): string {
  const { selected } = result;
  switch (selected.kind) {
    case "package":
      return result.packageOption?.name ?? "Package";
    case "labor_only":
      return "Labor only — 2 movers, no truck";
    case "van_flat":
      return "Cargo van flat — single large item";
    case "cargo_van":
      return "Cargo van small-item delivery";
    default:
      return `${selected.crew ?? 2} movers + 26-ft liftgate truck`;
  }
}

function selectedCrewSize(result: MovingQuoteResult): number {
  const { selected } = result;
  if (selected.kind === "package") return result.packageOption?.crewShown ?? 2;
  if (selected.kind === "van_flat" || selected.kind === "cargo_van") return 1;
  return selected.crew ?? 2;
}

function CrewTable({
  input,
  result,
  onSelect,
}: {
  input: MovingQuoteInput;
  result: MovingQuoteResult;
  onSelect: (crew: CrewSize) => void;
}) {
  const selectedCrew = result.selected.kind === "hourly" || result.selected.kind === "labor_only" ? result.selected.crew : undefined;
  const recommendedCrew = result.recommended.kind === "hourly" || result.recommended.kind === "labor_only" ? result.recommended.crew : undefined;
  const copyColumn = async (crew: CrewSize) => {
    await navigator.clipboard.writeText(customerTextFor(input, crew));
    toast.success(`${crew}-mover quote copied`);
  };
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Crew comparison</p>
      <div className="grid grid-cols-3 gap-2">
        {CREW_SIZES.map(crew => {
          const option = result.crewOptions[crew];
          const isSelected = selectedCrew === crew;
          const isRecommended = recommendedCrew === crew;
          return (
            <div
              key={crew}
              title={option.eligible ? undefined : option.ineligibleReason}
              className={`rounded-lg border p-2 text-left text-xs transition-colors ${
                isRecommended ? "border-[var(--moss-deep)] bg-[var(--moss-deep)]/10" : "border-border"
              } ${isSelected ? "ring-2 ring-[var(--moss-deep)]" : ""} ${option.eligible ? "" : "opacity-50"}`}
            >
              <button type="button" className="w-full text-left" onClick={() => onSelect(crew)} aria-pressed={isSelected}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-semibold">{crew} movers</span>
                  {isRecommended && <Badge className="bg-[var(--moss-deep)] px-1 py-0 text-[9px] text-white">Rec.</Badge>}
                </div>
                <div className="mt-1 text-muted-foreground">{money(option.rate)}/hr</div>
                <div className="text-muted-foreground">{hoursText(option.hours.low, option.hours.high)}</div>
                <div className="mt-1 font-semibold text-foreground">{rangeText(option.total.low, option.total.high)}</div>
                {!option.eligible && <div className="mt-1 leading-tight text-muted-foreground">{option.ineligibleReason}</div>}
              </button>
              <Button type="button" variant="ghost" size="sm" className="mt-1 h-6 w-full px-1 text-[11px]" onClick={() => copyColumn(crew)}>
                <Copy className="size-3" /> Copy
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PackageCard({ result, onUsePackage, onUseHourly }: { result: MovingQuoteResult; onUsePackage: () => void; onUseHourly: () => void }) {
  const pkg = result.packageOption;
  if (!pkg) return null;
  const active = result.selected.kind === "package";
  return (
    <div className={`rounded-lg border p-3 text-sm ${active ? "border-[var(--moss-deep)] bg-[var(--moss-deep)]/10" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Flat package</p>
          <p className="font-semibold">{pkg.name}</p>
        </div>
        <span className="text-lg font-bold">{money(pkg.total)}</span>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Flat price ({result.dayType})</span>
          <span className="font-medium text-foreground">{money(pkg.flatPrice)}</span>
        </div>
        <div className="flex justify-between">
          <span>Included on-site hours</span>
          <span className="font-medium text-foreground">{pkg.includedHours} hrs</span>
        </div>
        <div className="flex justify-between">
          <span>Extra time</span>
          <span className="font-medium text-foreground">{money(pkg.overageRate)}/hr</span>
        </div>
        <div className="flex justify-between">
          <span>Extra flights of stairs</span>
          <span className="font-medium text-foreground">
            {pkg.extraFlights} · {money(pkg.extraFlightsTotal)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Add-ons</span>
          <span className="font-medium text-foreground">{money2(pkg.addOnsTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Movers shown to the customer</span>
          <span className="font-medium text-foreground">{pkg.crewShown}</span>
        </div>
      </div>
      <div className="mt-3 inline-flex rounded-lg border border-border bg-muted/40 p-1" role="tablist" aria-label="Package or hourly">
        <button
          type="button"
          role="tab"
          aria-selected={active}
          onClick={onUsePackage}
          className={`rounded-md px-3 py-1 text-xs font-medium ${active ? "bg-[var(--moss-deep)] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Use package
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!active}
          onClick={onUseHourly}
          className={`rounded-md px-3 py-1 text-xs font-medium ${!active ? "bg-[var(--moss-deep)] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Use hourly
        </button>
      </div>
    </div>
  );
}

function Breakdown({ result, isOwner }: { result: MovingQuoteResult; isOwner: boolean }) {
  const lines = result.lines.filter(line => isOwner || !line.internalOnly);
  return (
    <div className="space-y-1.5 text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Breakdown (internal)</p>
      {lines.map((line, index) => (
        <div key={`${line.key}-${index}`} className="flex justify-between gap-3">
          <span className="min-w-0 text-muted-foreground">
            <span className={line.internalOnly ? "italic" : ""}>{line.label}</span>
            {line.detail && <span className="ml-1 text-xs">({line.detail})</span>}
            {line.internalOnly && <span className="block text-[11px] italic text-muted-foreground/80">internal — travel included in customer text</span>}
          </span>
          <span className="shrink-0 font-medium">{rangeText(line.low, line.high, money2)}</span>
        </div>
      ))}
      {isOwner && result.floorsApplied.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          Floors raised: {result.floorsApplied.map(floor => `${floor.label} ${money2(floor.from)} → ${money2(floor.to)}`).join("; ")}
        </div>
      )}
      <Separator className="my-1.5" />
      <div className="flex justify-between gap-3 text-base font-bold">
        <span>Total</span>
        <span>{rangeText(result.total.low, result.total.high)}</span>
      </div>
    </div>
  );
}

function StickyTotalBar({ result, onSave }: { result: MovingQuoteResult; onSave: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur xl:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{selectedOptionName(result)}</p>
          <p className="text-lg font-bold">{rangeText(result.total.low, result.total.high)}</p>
        </div>
        <Button onClick={onSave}>
          <Save className="size-4" />
          Save
        </Button>
      </div>
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

export interface MovingEstimatePanelProps {
  customerName: string;
  onCustomerNameChange: (v: string) => void;
  pickupAddress: string;
  onPickupAddressChange: (v: string) => void;
  deliveryAddress: string;
  onDeliveryAddressChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  /** A saved estimate the user clicked "Load" on (mode "moving"). May carry `moving` (v19) or only `service` (legacy). */
  loadSeed?: SavedEstimate | null;
  onSaved: () => void;
}

export function MovingEstimatePanel({
  customerName,
  onCustomerNameChange,
  pickupAddress,
  onPickupAddressChange,
  deliveryAddress,
  onDeliveryAddressChange,
  notes,
  onNotesChange,
  loadSeed,
  onSaved,
}: MovingEstimatePanelProps) {
  const { isOwner } = useStaffSession();
  const [input, setInput] = useState<MovingQuoteInput>(() => defaultMovingInput());
  const [sqft, setSqft] = useState("");
  const [walkthrough, setWalkthrough] = useState<Record<string, boolean>>({});
  const [walkthroughNotes, setWalkthroughNotes] = useState("");
  const [pickupElevator, setPickupElevator] = useState(false);
  const [deliveryElevator, setDeliveryElevator] = useState(false);
  const [legacySeed, setLegacySeed] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);

  const patch = (next: Partial<MovingQuoteInput>) => setInput(current => ({ ...current, ...next }));
  const patchPacking = (next: Partial<MovingQuoteInput["packing"]>) => setInput(current => ({ ...current, packing: { ...current.packing, ...next } }));

  const result = useMemo(() => calculateMovingQuote(input), [input]);
  const packing = useMemo(() => packingBreakdown(input, result.dayType), [input, result.dayType]);

  // ── Load a saved estimate ───────────────────────────────────────────────
  useEffect(() => {
    if (!loadSeed || loadSeed.mode !== "moving") return;
    try {
      if (loadSeed.moving) {
        const snap = loadSeed.moving;
        setInput(defaultMovingInput(snap.input));
        setWalkthrough(snap.walkthrough ?? {});
        setWalkthroughNotes(snap.walkthroughNotes ?? "");
        setSqft(snap.sqft ?? "");
        setPickupElevator(false);
        setDeliveryElevator(false);
        setLegacySeed(false);
        return;
      }
      if (loadSeed.service) {
        const service = loadSeed.service;
        const pickupFloor = service.pickupStairFloor ?? service.stairFloor ?? "none";
        const deliveryFloor = service.deliveryStairFloor ?? (service.stairDirections === 2 ? service.stairFloor : "none") ?? "none";
        const laborOnly = service.lineItems.some(line => line.itemId.includes("labor-only"));
        setInput(
          defaultMovingInput({
            pickupFlights: STAIR_FLOOR_FLIGHTS[pickupFloor] ?? 0,
            deliveryFlights: STAIR_FLOOR_FLIGHTS[deliveryFloor] ?? 0,
            distanceMiles: service.routeMiles,
            laborOnly,
            crew: laborOnly ? 2 : 3,
          }),
        );
        setWalkthrough({});
        setWalkthroughNotes("");
        setSqft("");
        setLegacySeed(true);
      }
    } catch (error) {
      console.error("[MovingEstimatePanel] could not load saved estimate", error);
      toast.error("That saved estimate couldn't be loaded — starting fresh.");
      setInput(defaultMovingInput());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSeed?.id]);

  // ── Derived bits ────────────────────────────────────────────────────────
  const moveDayLabel = input.moveDate ? shortDateLabel(input.moveDate) : "";
  const isHourlyLike = result.selected.kind === "hourly" || result.selected.kind === "labor_only";
  const selectedCrew: CrewSize = (result.selected.crew ?? input.crew) as CrewSize;
  const selectedCrewOption = result.crewOptions[selectedCrew];
  const recommendedCrew = result.recommended.crew;

  // ── Actions ─────────────────────────────────────────────────────────────
  const selectCrew = (crew: CrewSize) => patch({ crew, mode: input.laborOnly ? "labor_only" : "hourly" });

  const autoFillDistance = async () => {
    const origin = pickupAddress.trim();
    const destination = deliveryAddress.trim();
    if (!origin || !destination) {
      toast.message("Enter both addresses to auto-fill the miles.");
      return;
    }
    setAutoFilling(true);
    try {
      await loadMapScript();
      const route = await getPointToPointRoute(origin, destination);
      if (route.miles != null) {
        patch({ distanceMiles: Math.round(route.miles * 10) / 10 });
        toast.success(`Distance filled: ${route.miles.toFixed(1)} mi`);
      }
    } catch {
      // Best-effort only — stays manual, no error toast (Maps key may not allow Distance Matrix).
    } finally {
      setAutoFilling(false);
    }
  };

  const buildSnapshot = (): MovingEstimateSnapshot => ({
    pricingVersion: result.pricingVersion,
    input,
    result,
    walkthrough,
    walkthroughNotes: walkthroughNotes || undefined,
    sqft: sqft || undefined,
  });

  const handleSave = async () => {
    if (!pickupAddress.trim()) {
      toast.error("Enter a pickup address to save the estimate.");
      return;
    }
    const now = new Date().toISOString();
    const crewSize = selectedCrewSize(result);
    const estimate: SavedEstimate = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      customerName: customerName || undefined,
      jobAddress: pickupAddress.trim(),
      deliveryAddress: deliveryAddress.trim() || undefined,
      loadLabel: "Moving",
      materialName: selectedOptionName(result),
      // Placeholder — moving estimates are distinguished by `mode`, not material.
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
      baseCost: 0,
      recommendedQuote: result.total.low,
      quoteRangeLower: result.total.low,
      quoteRangeUpper: result.total.high,
      finalQuote: result.total.high,
      estimatedHours: isHourlyLike ? selectedCrewOption.hours.high : result.packageOption?.includedHours,
      notes: notes || undefined,
      mode: "moving",
      serviceType: "moving",
      crewSize,
      moving: buildSnapshot(),
    };
    try {
      await saveEstimateConfirmed(estimate);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Estimate could not be saved.");
      return;
    }
    onSaved();
    toast.success("Moving estimate saved");
  };

  const copyCustomer = async (text = result.customerText, label = "Customer quote") => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const downloadPdf = async () => {
    const lineItems: QuotePdfLine[] = result.lines
      .filter(line => !line.internalOnly)
      .map(line => (line.low === line.high ? { label: line.label, amount: line.low } : { label: line.label, amountText: `${money(line.low)}–${money(line.high)}` }));
    const facts: Array<{ label: string; value: string }> = [{ label: "Crew", value: `${selectedCrewSize(result)} mover${selectedCrewSize(result) === 1 ? "" : "s"}` }];
    if (moveDayLabel) facts.push({ label: "Move date", value: `${moveDayLabel} · ${result.dayType}` });
    facts.push({ label: "Home", value: homeSizeLabel(input.homeSize) });
    if (input.distanceMiles != null) facts.push({ label: "Distance", value: `${input.distanceMiles} mi` });
    try {
      const fileName = await downloadQuotePdf({
        heading: "Moving Estimate",
        customerName: customerName || undefined,
        addressLabel: "Pickup",
        address: pickupAddress || undefined,
        secondAddressLabel: "Delivery",
        secondAddress: deliveryAddress || undefined,
        total: result.total.high,
        ...(result.total.low !== result.total.high ? { rangeLower: result.total.low, rangeUpper: result.total.high } : {}),
        facts,
        lineItems,
        notes: notes || undefined,
        ...(isHourlyLike ? { disclaimer: ESTIMATE_DISCLAIMER } : {}),
      });
      toast.success(`Saved ${fileName} — ready to text or email.`);
    } catch (error) {
      console.error("[MovingEstimatePanel] PDF generation failed", error);
      toast.error("Couldn't build the PDF. Please try again.");
    }
  };

  const reset = () => {
    setInput(defaultMovingInput());
    setSqft("");
    setWalkthrough({});
    setWalkthroughNotes("");
    setPickupElevator(false);
    setDeliveryElevator(false);
    setLegacySeed(false);
    onCustomerNameChange("");
    onPickupAddressChange("");
    onDeliveryAddressChange("");
    onNotesChange("");
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="grid gap-6 pb-24 xl:grid-cols-[minmax(0,1fr)_420px] xl:pb-0">
      <Card>
        <CardContent className="divide-y divide-border pt-6">
          {legacySeed && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                Legacy v18 pricing save — rebuild with v19. Stairs, distance and labor-only were pre-filled; check home size, date and crew.
              </span>
            </div>
          )}

          {/* 1 · Job */}
          <Section number={1} title="Job">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="mv-customer">Customer name</Label>
                <Input id="mv-customer" value={customerName} onChange={event => onCustomerNameChange(event.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mv-pickup">Pickup address</Label>
                <Input id="mv-pickup" value={pickupAddress} onChange={event => onPickupAddressChange(event.target.value)} placeholder="Where the crew loads" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mv-delivery">Delivery address</Label>
                <Input id="mv-delivery" value={deliveryAddress} onChange={event => onDeliveryAddressChange(event.target.value)} placeholder="Where the crew unloads" />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mv-date">Move date</Label>
                <Input id="mv-date" type="date" className="w-44" value={input.moveDate ?? ""} onChange={event => patch({ moveDate: event.target.value || undefined })} />
              </div>
              <div className="flex items-center gap-2 pb-1.5">
                {input.moveDate ? <DayChip dayType={result.dayType} label={moveDayLabel} /> : <span className="text-xs text-muted-foreground">No date — weekday pricing</span>}
                {input.dayType && <span className="text-[11px] text-muted-foreground">(overridden)</span>}
              </div>
              <div className="space-y-1.5">
                <span className="block text-xs text-muted-foreground">Day type</span>
                <Segmented<"auto" | DayType>
                  size="sm"
                  label="Day type override"
                  value={input.dayType ?? "auto"}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "weekday", label: "Weekday" },
                    { value: "weekend", label: "Weekend" },
                  ]}
                  onChange={value => patch({ dayType: value === "auto" ? undefined : value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Weekend = Fri, Sat, Sun, plus the first two and last two days of any month.</p>
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs">
                  <ChevronDown className="size-3.5" /> Notes{notes.trim() ? " (has text)" : ""}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <Textarea id="mv-notes" value={notes} onChange={event => onNotesChange(event.target.value)} placeholder="Access notes, exclusions, special handling…" />
              </CollapsibleContent>
            </Collapsible>
          </Section>

          {/* 2 · Home */}
          <Section number={2} title="Home">
            <Segmented<HomeSize> label="Home size" value={input.homeSize} options={HOME_SIZES} onChange={homeSize => patch({ homeSize, itemCount: homeSize === "few_items" ? (input.itemCount ?? 4) : undefined })} />
            <div className="flex flex-wrap items-end gap-5">
              {input.homeSize === "few_items" && (
                <div className="space-y-1.5">
                  <span className="block text-xs text-muted-foreground">How many items</span>
                  <Stepper label="item count" value={input.itemCount ?? 0} onChange={itemCount => patch({ itemCount })} min={1} max={30} />
                  <p className="text-[11px] text-muted-foreground">Up to 8 = Small Move package · 1 item = van flat</p>
                </div>
              )}
              <div className="space-y-1.5">
                <span className="block text-xs text-muted-foreground">Stories at pickup</span>
                <Segmented<1 | 2 | 3>
                  size="sm"
                  label="Stories"
                  value={input.stories}
                  options={[
                    { value: 1, label: "1" },
                    { value: 2, label: "2" },
                    { value: 3, label: "3" },
                  ]}
                  onChange={stories => patch({ stories })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mv-sqft" className="text-xs text-muted-foreground">
                  Square feet (optional)
                </Label>
                <Input id="mv-sqft" className="w-28" value={sqft} onChange={event => setSqft(event.target.value)} placeholder="2,400" />
              </div>
            </div>
          </Section>

          {/* 3 · Access */}
          <Section number={3} title="Access" hint="Flights of stairs at each address">
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  { key: "pickup", label: "Pickup", flights: input.pickupFlights, elevator: pickupElevator },
                  { key: "delivery", label: "Delivery", flights: input.deliveryFlights, elevator: deliveryElevator },
                ] as const
              ).map(side => (
                <div key={side.key} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{side.label}</span>
                    {side.elevator ? (
                      <Badge variant="secondary">elevator</Badge>
                    ) : (
                      <Stepper
                        label={`${side.label} flights`}
                        value={side.flights}
                        max={4}
                        onChange={flights => patch(side.key === "pickup" ? { pickupFlights: flights } : { deliveryFlights: flights })}
                      />
                    )}
                  </div>
                  <CheckRow
                    id={`mv-elevator-${side.key}`}
                    label="Elevator"
                    checked={side.elevator}
                    onChange={checked => {
                      if (side.key === "pickup") {
                        setPickupElevator(checked);
                        if (checked) patch({ pickupFlights: 0 });
                      } else {
                        setDeliveryElevator(checked);
                        if (checked) patch({ deliveryFlights: 0 });
                      }
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Packages include the first flight per address (+$75 per extra flight). Hourly jobs add time, not a fee.</p>
          </Section>

          {/* 4 · Distance */}
          <Section number={4} title="Distance" hint="Miles between the two addresses">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Input
                  id="mv-miles"
                  type="number"
                  min="0"
                  step="1"
                  className="w-28"
                  value={input.distanceMiles ?? ""}
                  onChange={event => patch({ distanceMiles: event.target.value === "" ? undefined : Math.max(0, numeric(event.target.value)) })}
                  placeholder="miles"
                  aria-label="Distance in miles"
                />
                <Label htmlFor="mv-miles" className="text-sm font-normal text-muted-foreground">
                  mi
                </Label>
              </div>
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={autoFillDistance} disabled={autoFilling}>
                {autoFilling ? "Looking up…" : "Auto-fill"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>≤15 mi: van flat eligible</span>
              <span>Over 50 mi: dispatch approval</span>
              <span>51–75 mi +$150 · 76–100 mi +$300 · over 100 manual</span>
            </div>
          </Section>

          {/* 5 · Piano & specialty */}
          <Section number={5} title="Piano & specialty">
            <Segmented<PianoType> label="Piano" value={input.piano} options={PIANOS} onChange={piano => patch({ piano, pianoStairLocations: piano === "none" ? 0 : input.pianoStairLocations, pianoAccessUnusual: piano === "none" ? false : input.pianoAccessUnusual })} />
            {input.piano !== "none" && (
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
                <span className="text-xs text-muted-foreground">Stairs / difficult access at</span>
                <PianoStairsToggles value={input.pianoStairLocations} onChange={pianoStairLocations => patch({ pianoStairLocations })} />
                <CheckRow id="mv-piano-unusual" label="Unusual access" hint="crane, balcony, spiral, >2 flights" checked={input.pianoAccessUnusual} onChange={pianoAccessUnusual => patch({ pianoAccessUnusual })} />
                <span className="text-xs text-muted-foreground">Flat {money(MOVING_RATES.piano[input.piano])} + {money(MOVING_RATES.piano.stairsPerLocation)} per location with stairs</span>
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              <CheckRow id="mv-safe" label="Safe" checked={input.specialtyFlags.safe} onChange={safe => patch({ specialtyFlags: { ...input.specialtyFlags, safe } })} />
              <CheckRow id="mv-hottub" label="Hot tub" checked={input.specialtyFlags.hotTub} onChange={hotTub => patch({ specialtyFlags: { ...input.specialtyFlags, hotTub } })} />
              <CheckRow id="mv-300lb" label="Item over 300 lb" checked={input.specialtyFlags.over300lb} onChange={over300lb => patch({ specialtyFlags: { ...input.specialtyFlags, over300lb } })} />
            </div>
          </Section>

          {/* 6 · Packing */}
          <Section number={6} title="Packing">
            <SwitchRow id="mv-packing" label="We pack for the customer" hint="packers × hours + materials" checked={input.packing.enabled} onChange={enabled => patchPacking({ enabled })} />
            {input.packing.enabled && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-end gap-4">
                  <SwitchRow id="mv-packing-separate" label="Separate packing day" checked={input.packing.separateDay} onChange={separateDay => patchPacking({ separateDay })} />
                  {input.packing.separateDay && (
                    <div className="flex items-end gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="mv-packing-date" className="text-xs text-muted-foreground">
                          Packing date
                        </Label>
                        <Input id="mv-packing-date" type="date" className="w-44" value={input.packing.packingDate ?? ""} onChange={event => patchPacking({ packingDate: event.target.value || undefined })} />
                      </div>
                      {input.packing.packingDate && <div className="pb-1.5"><DayChip dayType={dayTypeOf(input.packing.packingDate)} label={shortDateLabel(input.packing.packingDate)} /></div>}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-5">
                  <div className="space-y-1.5">
                    <span className="block text-xs text-muted-foreground">Packers</span>
                    <Segmented<2 | 3 | 4>
                      size="sm"
                      label="Packers"
                      value={input.packing.packers}
                      options={[
                        { value: 2, label: "2" },
                        { value: 3, label: "3" },
                        { value: 4, label: "4" },
                      ]}
                      onChange={packers => patchPacking({ packers })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="block text-xs text-muted-foreground">Boxes</span>
                    <div className="flex items-center gap-2">
                      <Stepper label="boxes" value={input.packing.boxes} max={999} onChange={boxes => patchPacking({ boxes })} />
                      <Input type="number" min="0" className="w-20" value={input.packing.boxes} onChange={event => patchPacking({ boxes: Math.max(0, Math.round(numeric(event.target.value))) })} aria-label="Boxes" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Books and toys go in small boxes — count high.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mv-packer-hours" className="text-xs text-muted-foreground">
                      Packer hours {packing ? `(computed ${packing.hours})` : ""}
                    </Label>
                    <Input
                      id="mv-packer-hours"
                      type="number"
                      min="0"
                      step="0.25"
                      className="w-24"
                      value={input.packing.hoursOverride ?? ""}
                      placeholder={packing ? String(packing.hours) : "0"}
                      onChange={event => patchPacking({ hoursOverride: event.target.value === "" ? undefined : Math.max(0, numeric(event.target.value)) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mv-per-box" className="text-xs text-muted-foreground">
                      Materials per box
                    </Label>
                    <Input id="mv-per-box" type="number" min="0" step="0.5" className="w-24" value={input.packing.perBoxMaterials} onChange={event => patchPacking({ perBoxMaterials: Math.max(0, numeric(event.target.value)) })} />
                  </div>
                </div>
                {packing && (
                  <div className="grid gap-1 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        Packing labor{packing.dateLabel ? `, ${packing.dateLabel} (${packing.dayType})` : ""} — {packing.packers} packers × {packing.hours} hrs × {money(packing.ratePerHour)}
                      </span>
                      <span className="font-medium">{money2(packing.labor)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        Packing materials — {packing.boxes} boxes × {money2(packing.perBox)}
                      </span>
                      <span className="font-medium">{money2(packing.materials)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* 7 · Add-ons */}
          <Section number={7} title="Add-ons">
            <div className="space-y-2">
              <span className="block text-xs text-muted-foreground">Furniture assembly at the new place (priced per piece, no separate minimum)</span>
              <div className="flex flex-wrap gap-2">
                {ASSEMBLY_SKUS.map(sku => {
                  const qty = input.assemblyAddOns.find(addOn => addOn.skuId === sku.id)?.qty ?? 0;
                  const setQty = (next: number) =>
                    patch({
                      assemblyAddOns: [...input.assemblyAddOns.filter(addOn => addOn.skuId !== sku.id), ...(next > 0 ? [{ skuId: sku.id, qty: next }] : [])],
                    });
                  return (
                    <div key={sku.id} className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${qty > 0 ? "border-[var(--moss-deep)] bg-[var(--moss-deep)]/10" : "border-border"}`}>
                      {qty === 0 ? (
                        <button type="button" className="font-medium" onClick={() => setQty(1)}>
                          + {sku.name} <span className="text-muted-foreground">{money(sku.price)}</span>
                        </button>
                      ) : (
                        <>
                          <span className="font-medium">
                            {sku.name} <span className="text-muted-foreground">{money(sku.price)}</span>
                          </span>
                          <Stepper label={sku.name} value={qty} max={20} onChange={setQty} />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-sm">TV mounts ≤65"</span>
                <Stepper label="TV mounts up to 65 inch" value={input.tvMounts.upTo65} max={10} onChange={upTo65 => patch({ tvMounts: { ...input.tvMounts, upTo65 } })} />
                <span className="text-xs text-muted-foreground">{money(MOVING_RATES.tvMount.upTo65)} each</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">TV mounts &gt;65"</span>
                <Stepper label="TV mounts over 65 inch" value={input.tvMounts.over65} max={10} onChange={over65 => patch({ tvMounts: { ...input.tvMounts, over65 } })} />
                <span className="text-xs text-muted-foreground">{money(MOVING_RATES.tvMount.over65)} each</span>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <SwitchRow id="mv-play" label="Large play structure" hint="wooden playset / swing set — its own line, never move-day hours" checked={input.playStructure.enabled} onChange={enabled => patch({ playStructure: { ...input.playStructure, enabled } })} />
              {input.playStructure.enabled && (
                <div className="flex flex-wrap items-end gap-4">
                  <Segmented<"flat" | "hourly">
                    size="sm"
                    label="Play structure pricing"
                    value={input.playStructure.mode}
                    options={[
                      { value: "flat", label: "Flat" },
                      { value: "hourly", label: "Hourly" },
                    ]}
                    onChange={mode => patch({ playStructure: { ...input.playStructure, mode } })}
                  />
                  {input.playStructure.mode === "flat" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="mv-play-price" className="text-xs text-muted-foreground">
                        Flat price
                      </Label>
                      <Input id="mv-play-price" type="number" min="0" step="1" className="w-28" value={input.playStructure.price} onChange={event => patch({ playStructure: { ...input.playStructure, price: Math.max(0, numeric(event.target.value)) } })} />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label htmlFor="mv-play-hours" className="text-xs text-muted-foreground">
                        Hours (at the labor rate)
                      </Label>
                      <Input id="mv-play-hours" type="number" min="0" step="0.25" className="w-28" value={input.playStructure.hours ?? ""} onChange={event => patch({ playStructure: { ...input.playStructure, hours: event.target.value === "" ? undefined : Math.max(0, numeric(event.target.value)) } })} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <SwitchRow id="mv-second-truck" label="Second truck" hint="manual price — Abe decides per job" checked={input.secondTruck.requested} onChange={requested => patch({ secondTruck: { ...input.secondTruck, requested } })} />
              {input.secondTruck.requested && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="mv-second-truck-price" className="text-xs text-muted-foreground">
                      Price
                    </Label>
                    <Input id="mv-second-truck-price" type="number" min="0" step="1" className="w-28" value={input.secondTruck.price} onChange={event => patch({ secondTruck: { ...input.secondTruck, price: Math.max(0, numeric(event.target.value)) } })} />
                  </div>
                  {!(input.secondTruck.price > 0) && (
                    <span className="flex items-center gap-1 pb-2 text-xs text-amber-900">
                      <AlertTriangle className="size-3.5" /> Set a price or confirm no charge.
                    </span>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* 8 · Walkthrough */}
          <Section number={8} title="Walkthrough">
            <CheckRow id="mv-walkthrough-done" label="Walkthrough done" checked={input.walkthroughDone} onChange={walkthroughDone => patch({ walkthroughDone })} />
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs">
                  <ChevronDown className="size-3.5" /> On-site checklist ({Object.values(walkthrough).filter(Boolean).length}/{WALKTHROUGH_ITEMS.length})
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                <div className="grid gap-2 md:grid-cols-2">
                  {WALKTHROUGH_ITEMS.map(item => (
                    <CheckRow key={item.key} id={`mv-wt-${item.key}`} label={item.label} checked={Boolean(walkthrough[item.key])} onChange={checked => setWalkthrough(current => ({ ...current, [item.key]: checked }))} />
                  ))}
                </div>
                <Textarea value={walkthroughNotes} onChange={event => setWalkthroughNotes(event.target.value)} placeholder="Walkthrough notes — what you saw, what to watch for on move day…" aria-label="Walkthrough notes" />
              </CollapsibleContent>
            </Collapsible>
          </Section>

          {/* 9 · Crew & hours */}
          <Section number={9} title="Crew & hours">
            <div className="flex flex-wrap items-center gap-4">
              <Segmented<CrewSize>
                label="Crew size"
                value={selectedCrew}
                options={CREW_SIZES.map(crew => ({
                  value: crew,
                  label: `${crew} movers`,
                  badge: recommendedCrew === crew && (result.recommended.kind === "hourly" || result.recommended.kind === "labor_only") ? "Recommended" : undefined,
                  disabled: input.laborOnly && crew !== 2,
                  title: result.crewOptions[crew].eligible ? undefined : result.crewOptions[crew].ineligibleReason,
                }))}
                onChange={selectCrew}
              />
              {input.mode !== "auto" && (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => patch({ mode: "auto" })}>
                  Back to auto
                </Button>
              )}
            </div>
            <SwitchRow
              id="mv-labor-only"
              label="Labor only — customer provides the truck"
              hint="2 movers, no trip charge, full payment at booking"
              checked={input.laborOnly}
              onChange={laborOnly => patch({ laborOnly, crew: laborOnly ? 2 : input.crew, mode: laborOnly ? "labor_only" : "auto" })}
            />
            {input.homeSize === "few_items" && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Single-item options:</span>
                <Segmented<"none" | "van_flat" | "cargo_van">
                  size="sm"
                  label="Single-item option"
                  value={input.mode === "van_flat" || input.mode === "cargo_van" ? input.mode : "none"}
                  options={[
                    { value: "none", label: "Crew + truck" },
                    { value: "van_flat", label: `Van flat ${money(result.vanFlat.price)}`, title: result.vanFlat.eligible ? undefined : result.vanFlat.reason },
                    { value: "cargo_van", label: `Cargo van ${money(result.cargoVan.price)}` },
                  ]}
                  onChange={value => patch({ mode: value === "none" ? "auto" : value })}
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
              <div className="text-sm">
                <span className="text-muted-foreground">Estimated hours for {selectedCrew} movers: </span>
                <span className="font-semibold">{hoursText(selectedCrewOption.hours.low, selectedCrewOption.hours.high)}</span>
                {selectedCrewOption.minimumApplied && <span className="ml-1 text-xs text-muted-foreground">(minimum applied)</span>}
              </div>
              <SwitchRow
                id="mv-hours-override"
                label="Override"
                checked={Boolean(input.hoursOverride)}
                onChange={checked =>
                  patch({
                    hoursOverride: checked ? { low: selectedCrewOption.hours.low, high: selectedCrewOption.hours.high } : undefined,
                    crew: selectedCrew,
                    mode: checked && input.mode === "auto" ? (input.laborOnly ? "labor_only" : "hourly") : input.mode,
                  })
                }
              />
              {input.hoursOverride && (
                <div className="flex items-center gap-2">
                  <Input type="number" min="0" step="0.25" className="w-20" value={input.hoursOverride.low} onChange={event => patch({ hoursOverride: { low: Math.max(0, numeric(event.target.value)), high: input.hoursOverride!.high } })} aria-label="Low hours" />
                  <span className="text-muted-foreground">to</span>
                  <Input type="number" min="0" step="0.25" className="w-20" value={input.hoursOverride.high} onChange={event => patch({ hoursOverride: { low: input.hoursOverride!.low, high: Math.max(0, numeric(event.target.value)) } })} aria-label="High hours" />
                  <span className="text-xs text-muted-foreground">hrs</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Stairs add ½–¾ hour per flight per address. Distance inside the metro adds no hours. 4 movers carry a 4-hour minimum.</p>
          </Section>
        </CardContent>
      </Card>

      {/* Right — sticky quote */}
      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Moving Quote</CardTitle>
                <CardDescription>{selectedOptionName(result)}</CardDescription>
              </div>
              <DayChip dayType={result.dayType} />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{result.selected.kind === result.recommended.kind && result.selected.crew === result.recommended.crew ? "Recommended" : "Selected"}</p>
              <p className="mt-1 text-3xl font-bold text-primary">{rangeText(result.total.low, result.total.high)}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {isHourlyLike && <Badge variant="outline">estimate, not fixed</Badge>}
                {result.selected.kind === "package" && <Badge variant="outline">flat, travel included</Badge>}
                <span>{result.selected.reason}</span>
              </div>
            </div>

            {!(result.selected.kind === "van_flat" || result.selected.kind === "cargo_van") && <CrewTable input={input} result={result} onSelect={selectCrew} />}

            <PackageCard result={result} onUsePackage={() => patch({ mode: "package" })} onUseHourly={() => patch({ mode: "hourly", crew: recommendedCrewFallback(result, input) })} />

            <Separator />

            <Breakdown result={result} isOwner={isOwner} />

            <WarningBanners warnings={result.warnings} />

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleSave}>
                <Save className="size-4" />
                Save
              </Button>
              <div className="flex">
                <Button variant="outline" className="flex-1 rounded-r-none" onClick={() => copyCustomer()}>
                  <Copy className="size-4" />
                  Customer
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="rounded-l-none border-l-0" aria-label="Copy a crew column">
                      <ChevronDown className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {CREW_SIZES.map(crew => (
                      <DropdownMenuItem key={crew} onClick={() => copyCustomer(customerTextFor(input, crew), `${crew}-mover quote`)}>
                        Copy {crew}-mover quote
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button variant="outline" onClick={downloadPdf}>
                <FileDown className="size-4" />
                PDF
              </Button>
              <Button variant="secondary" onClick={reset}>
                <RotateCcw className="size-4" />
                Reset
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Pricing {result.pricingVersion}. The trip fee is baked into truck totals and never shown to the customer.</p>
          </CardContent>
        </Card>
      </aside>

      <StickyTotalBar result={result} onSave={handleSave} />
    </div>
  );
}

function recommendedCrewFallback(result: MovingQuoteResult, input: MovingQuoteInput): CrewSize {
  if (result.recommended.crew) return result.recommended.crew;
  return input.crew;
}

function PianoStairsToggles({ value, onChange }: { value: 0 | 1 | 2; onChange: (next: 0 | 1 | 2) => void }) {
  // Pickup / delivery toggles → count of locations with stairs (0–2).
  const [pickup, setPickup] = useState(value >= 1);
  const [delivery, setDelivery] = useState(value >= 2);
  useEffect(() => {
    if (value === 0) {
      setPickup(false);
      setDelivery(false);
    }
  }, [value]);
  const update = (nextPickup: boolean, nextDelivery: boolean) => {
    setPickup(nextPickup);
    setDelivery(nextDelivery);
    onChange(((nextPickup ? 1 : 0) + (nextDelivery ? 1 : 0)) as 0 | 1 | 2);
  };
  return (
    <div className="flex gap-4">
      <CheckRow id="mv-piano-stairs-pickup" label="Pickup" checked={pickup} onChange={next => update(next, delivery)} />
      <CheckRow id="mv-piano-stairs-delivery" label="Delivery" checked={delivery} onChange={next => update(pickup, next)} />
    </div>
  );
}
