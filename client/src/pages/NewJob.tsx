import { useStaffSession } from "@/hooks/useStaffSession";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { OperationsShell } from "@/components/OperationsShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getClients } from "@/lib/clientStorage";
import {
  createDispatchJob,
  employeeLabel,
  employeeOptions,
  leadSourceOptions,
  serviceTypeOptions,
} from "@/lib/dispatchOperations";
import { fleetVehicles, vehicleUnitCode } from "@/lib/fleet";
import {
  MOVING_INCLUDED_HOURS,
  defaultStopsFor,
  deliveryKindLabels,
  deliveryKinds,
  isFullDayMove,
  movingKindLabels,
  movingKinds,
  phoenixDayType,
  requiredCrewFor,
} from "@/lib/jobShape";
import { getJobByEstimateId, getJobs, ticketFieldsFromEstimate } from "@/lib/jobStorage";
import { getThumbtackLeads, type ThumbtackLead } from "@/lib/leadsStorage";
import {
  ASSEMBLY_JOBS_PER_DAY,
  DAILY_SLOTS,
  buildDayBoard,
  defaultVehicleForSlot,
  fromDateInputValue,
  getSlot,
  jobTakesFullDay,
  sameDay,
  slotWindow,
  toDateInputValue,
  vehicleClassForService,
  vehicleClassForType,
  type DailySlot,
  type SlotKey,
} from "@/lib/scheduleSlots";
import { cn } from "@/lib/utils";
import { loadPricingSettings, loadSavedEstimates } from "@/utils/pricingStorage";
import type { ClientRecord } from "@/types/clients";
import type { CustomerJobStopType, JobItem, JobStop } from "@/types/driver";
import type { EmployeeRecord } from "@/types/employees";
import type { CanonicalJobServiceType, DeliveryKind, Job, JobCrewMember, JobLeadRef, JobLeadSource, JobQuote, MovingDetails, MovingKind } from "@/types/jobs";
import type { SavedEstimate } from "@/types/pricing";

const stopTypes: CustomerJobStopType[] = ["pickup", "delivery", "service", "material_pickup", "other"];

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const shortDayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

function uid(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newStop(order: number, stopType: CustomerJobStopType = "other"): JobStop {
  const now = new Date().toISOString();
  return {
    id: uid("stop"),
    jobId: "",
    stopOrder: order,
    stopType,
    name: stopType === "pickup" ? "Pickup" : stopType === "delivery" ? "Delivery" : `Stop ${order}`,
    state: "AZ",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

function newItem(stopId: string | undefined): JobItem {
  const now = new Date().toISOString();
  return {
    id: uid("item"),
    jobId: "",
    stopId,
    name: "",
    quantity: 1,
    oversized: false,
    fragile: false,
    heavy: false,
    disassemblyRequired: false,
    reassemblyRequired: false,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

function stopTitle(stop: JobStop, index: number) {
  if (stop.stopType === "pickup") return "Pickup";
  if (stop.stopType === "delivery") return "Delivery";
  if (stop.stopType === "service") return "Service location";
  return `Stop ${index + 1}`;
}

const serviceHints: Record<CanonicalJobServiceType, string> = {
  moving: "Box truck · pickup → delivery",
  delivery: "Van · one item, one trip",
  assembly_handyman: "Assembly tech · one job per day",
  junk_removal: "Van or box truck · haul-away",
  other: "Anything else",
};

export default function NewJob() {
  const { isOwner } = useStaffSession();
  const [, navigate] = useLocation();
  const employees = useMemo(() => sortCrew(employeeOptions()), []);
  // Fleet units only (SPR-01 … BOX-01) — never the pricing templates.
  const vehicles = useMemo(() => fleetVehicles(loadPricingSettings().vehicles), []);
  const [jobs, setJobs] = useState<Job[]>(() => getJobs());
  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    window.addEventListener("jobs-updated", refresh);
    return () => window.removeEventListener("jobs-updated", refresh);
  }, []);

  // Prefill from the Schedule page ("Open · Book" on a slot): /jobs/new?date=YYYY-MM-DD&slot=am_van
  const prefill = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const slot = getSlot(params.get("slot"));
    const date = params.get("date") ?? "";
    return { date: fromDateInputValue(date) ? date : toDateInputValue(new Date()), slot };
  }, []);

  // 1. What
  const [serviceType, setServiceType] = useState<CanonicalJobServiceType>(prefill.slot?.vehicleClass === "van" ? "delivery" : "moving");
  const [movingKind, setMovingKind] = useState<MovingKind>("studio_1br");
  const [deliveryKind, setDeliveryKind] = useState<DeliveryKind>("van_flat");
  const [jobLabel, setJobLabel] = useState("");
  // 2. Who
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [leadSource, setLeadSource] = useState<JobLeadSource>("phone");
  const [clientId, setClientId] = useState<string | undefined>();
  const [leadRef, setLeadRef] = useState<JobLeadRef | undefined>();
  // 3. Where
  const [stops, setStops] = useState<JobStop[]>(() => defaultStopsFor("moving", "studio_1br"));
  const stopsTouched = useMemo(() => ({ current: false }), []);
  const [items, setItems] = useState<JobItem[]>([]);
  const [thirdPartyPickup, setThirdPartyPickup] = useState(false);
  // 4. When
  const [date, setDate] = useState(prefill.date);
  const [slotKey, setSlotKey] = useState<SlotKey | undefined>(prefill.slot?.key);
  const [vehicleId, setVehicleId] = useState<string | undefined>(prefill.slot ? defaultVehicleForSlot(prefill.slot, vehicles)?.id : undefined);
  // 5. Crew
  const [crewOverride, setCrewOverride] = useState("");
  const [crewIds, setCrewIds] = useState<string[]>([]);
  // 6. Price
  const [quotedAmount, setQuotedAmount] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [estimatedProfit, setEstimatedProfit] = useState("");
  const [quote, setQuote] = useState<JobQuote | undefined>();
  const [sourceEstimateId, setSourceEstimateId] = useState<string | undefined>();
  const [moving, setMoving] = useState<MovingDetails | undefined>();
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState<number | undefined>();
  const [estimatePickerOpen, setEstimatePickerOpen] = useState(false);
  // 7. Notes
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const kindInput = {
    serviceType,
    movingKind: serviceType === "moving" ? movingKind : undefined,
    deliveryKind: serviceType === "delivery" ? deliveryKind : undefined,
  };
  const crewFloor = requiredCrewFor(kindInput);
  const requiredCrew = Math.max(crewFloor, Number(crewOverride || 0));
  const neededClass = vehicleClassForService(kindInput);
  const fullDay = jobTakesFullDay(kindInput);
  const isAssembly = serviceType === "assembly_handyman";
  const laborOnly = serviceType === "moving" && movingKind === "labor_only";
  const paymentTerms = laborOnly || thirdPartyPickup ? "full_upfront" : "deposit";

  const day = fromDateInputValue(date);
  const slot = getSlot(slotKey);
  const window_ = day && slot ? slotWindow(day, slot, fullDay) : undefined;
  const scheduledStart = window_?.start.toISOString();
  const scheduledEnd = window_?.end.toISOString();
  const dayType = phoenixDayType(scheduledStart ?? (day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12).toISOString() : undefined));
  const board = day ? buildDayBoard(jobs, day, vehicles) : undefined;
  const assemblyFull = Boolean(board && isAssembly && board.assemblyJobs.length >= ASSEMBLY_JOBS_PER_DAY);

  const slotVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.isActive && (!slot || vehicleClassForType(vehicle.vehicleType) === slot.vehicleClass)),
    [vehicles, slot],
  );
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);

  const crew: JobCrewMember[] = crewIds.map((employeeId, index) => ({ employeeId, role: index === 0 ? "lead" : "helper" }));
  const crewShort = crew.length < requiredCrew;

  const chooseServiceType = (next: CanonicalJobServiceType) => {
    setServiceType(next);
    if (!stopsTouched.current) setStops(defaultStopsFor(next, next === "moving" ? movingKind : undefined));
    const nextClass = vehicleClassForService({ serviceType: next, movingKind: next === "moving" ? movingKind : undefined, deliveryKind: next === "delivery" ? deliveryKind : undefined });
    if (slot && nextClass && slot.vehicleClass !== nextClass) {
      setSlotKey(undefined);
      setVehicleId(undefined);
    }
  };

  const chooseMovingKind = (next: MovingKind) => {
    setMovingKind(next);
    if (!stopsTouched.current) setStops(defaultStopsFor("moving", next));
    // A full-day package can only start in the morning.
    if (isFullDayMove(next) && slot?.period === "pm") {
      setSlotKey(undefined);
      setVehicleId(undefined);
    }
  };

  const pickSlot = (next: DailySlot) => {
    setSlotKey(next.key);
    const current = vehicles.find((vehicle) => vehicle.id === vehicleId);
    if (!current || vehicleClassForType(current.vehicleType) !== next.vehicleClass) {
      setVehicleId(defaultVehicleForSlot(next, vehicles)?.id);
    }
  };

  const shiftDay = (days: number) => {
    const base = day ?? new Date();
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    setDate(toDateInputValue(next));
  };

  const applyClient = (client: ClientRecord) => {
    setCustomerName(`${client.firstName} ${client.lastName}`.trim() || client.company || "");
    setPhone(client.phone ?? "");
    setEmail(client.email ?? "");
    setClientId(client.id);
    setLeadRef({ source: "direct" });
    if (!stopsTouched.current && client.streetAddress) {
      setStops((current) => current.map((stop, index) => index === 0 ? { ...stop, address: client.streetAddress, city: client.city, state: client.state ?? "AZ", zip: client.zip, contactName: `${client.firstName} ${client.lastName}`.trim(), contactPhone: client.phone } : stop));
    }
  };

  const applyLead = (lead: ThumbtackLead) => {
    setCustomerName(lead.name);
    setPhone(lead.phoneIsRelay ? "" : lead.phone ?? "");
    setEmail(lead.email ?? "");
    setClientId(undefined);
    setLeadSource(lead.source === "thumbtack" ? "thumbtack" : "housecall_pro");
    setLeadRef(lead.source === "thumbtack" ? { source: "thumbtack", negotiationId: lead.negotiationId, hcpJobId: lead.hcpJobId ?? undefined } : { source: "hcp", hcpJobId: lead.hcpJobId ?? undefined });
    if (!stopsTouched.current && lead.city) {
      setStops((current) => current.map((stop, index) => index === 0 ? { ...stop, city: lead.city ?? undefined, state: lead.state ?? "AZ", contactName: lead.name } : stop));
    }
    if (lead.phoneIsRelay) toast.info("This lead only has a Thumbtack relay number — enter the real phone if you have it.");
  };

  const applyEstimate = (estimate: SavedEstimate) => {
    const existing = getJobByEstimateId(estimate.id);
    if (existing) {
      toast.error(`That estimate already became job ${existing.jobNumber}.`);
      navigate(`/jobs/${existing.id}`);
      return;
    }
    const fields = ticketFieldsFromEstimate(estimate);
    const nextType = (fields.serviceType as CanonicalJobServiceType) ?? "other";
    setServiceType(nextType);
    if (fields.movingKind) setMovingKind(fields.movingKind);
    if (!customerName.trim()) setCustomerName(fields.customerName);
    setJobLabel(fields.jobLabel ?? "");
    setStops(fields.stops);
    stopsTouched.current = true;
    setItems(fields.items);
    setCrewOverride(fields.requiredCrew > requiredCrewFor({ serviceType: nextType, movingKind: fields.movingKind }) ? String(fields.requiredCrew) : "");
    if (fields.vehicleId) setVehicleId(fields.vehicleId);
    setQuotedAmount(String(Math.round(fields.quotedAmount)));
    if (isOwner) {
      setEstimatedCost(String(Math.round(estimate.baseCost)));
      setEstimatedProfit(String(Math.round(estimate.grossProfitDollars ?? estimate.finalQuote - estimate.baseCost)));
    }
    setQuote(fields.quote);
    setMoving(fields.moving);
    setEstimatedDurationMinutes(fields.estimatedDurationMinutes);
    setSourceEstimateId(fields.sourceEstimateId);
    if (fields.notes && !notes.trim()) setNotes(fields.notes);
    setEstimatePickerOpen(false);
    toast.success("Estimate copied onto the ticket — pick a slot and crew to book it.");
  };

  const save = async (mode: "draft" | "book") => {
    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (stops.length === 0) {
      toast.error("At least one stop is required");
      return;
    }
    if (mode === "book") {
      if (!stops[0].address?.trim()) {
        toast.error(`Enter the ${stopTitle(stops[0], 0).toLowerCase()} address to book. Drafts don't need it.`);
        return;
      }
      if (!day || !slot || !scheduledStart) {
        toast.error("Pick a day and a slot to book the job.");
        return;
      }
      if (!laborOnly && !vehicleId) {
        toast.error("Pick a vehicle for the slot.");
        return;
      }
      if (crewShort) {
        toast.error(`This job needs ${requiredCrew} on the crew — ${crew.length} assigned. Add crew or save a draft.`);
        return;
      }
      if (assemblyFull) {
        toast.error("The assembly tech already has a job that day — one assembly job per day.");
        return;
      }
      const taken = board?.bySlot[slot.key] ?? [];
      const blockedPm = fullDay ? (board?.bySlot["pm_box_truck"] ?? []) : [];
      if (taken.length > 0 || blockedPm.length > 0) {
        toast.error("That slot is already taken. Pick another slot or move the other job on the Schedule.");
        return;
      }
    }
    const profit = Number(estimatedProfit || 0);
    const quoted = Number(quotedAmount || 0);
    const job = await createDispatchJob({
      customerName,
      phone,
      email,
      leadSource,
      clientId,
      leadRef,
      sourceEstimateId,
      serviceType,
      movingKind: serviceType === "moving" ? movingKind : undefined,
      deliveryKind: serviceType === "delivery" ? deliveryKind : undefined,
      requiredCrew,
      jobLabel: serviceType === "other" ? jobLabel : jobLabel || undefined,
      scheduledStart,
      scheduledEnd,
      notes,
      internalNotes,
      estimatedDurationMinutes: estimatedDurationMinutes ?? (window_ ? Math.round((window_.end.getTime() - window_.start.getTime()) / 60000) : undefined),
      quotedAmount: quoted,
      quote: quote ?? (quoted > 0 ? { tier: quoteTier(kindInput), low: quoted, high: quoted, includedHours: serviceType === "moving" ? MOVING_INCLUDED_HOURS[movingKind] : undefined, source: "manual" } : undefined),
      moving,
      thirdPartyPickup: thirdPartyPickup || undefined,
      estimatedCost: isOwner ? Number(estimatedCost || 0) : undefined,
      estimatedProfit: isOwner ? profit : undefined,
      estimatedMarginDecimal: isOwner && quoted > 0 ? profit / quoted : undefined,
      stops: stops.map((stop, index) => ({ ...stop, stopOrder: index + 1, arrivalWindowStart: index === 0 ? scheduledStart : undefined, arrivalWindowEnd: index === 0 ? scheduledEnd : undefined })),
      items: items.filter((item) => item.name.trim()),
      assignment: {
        crewLeadId: crewIds[0],
        helperIds: crewIds.slice(1),
        vehicleId: laborOnly ? undefined : vehicleId,
        crewSequence: 1,
      },
    }, mode);
    if (mode === "book") {
      toast.success(`Booked ${slot?.shortLabel} on ${day ? shortDayFmt.format(day) : date}${selectedVehicle ? ` · ${vehicleUnitCode(selectedVehicle)}` : ""}`);
    } else {
      toast.success("Draft saved");
    }
    navigate(`/jobs/${job.id}`);
  };

  const patchStop = (stopId: string, updates: Partial<JobStop>) => {
    stopsTouched.current = true;
    setStops((current) => current.map((stop) => stop.id === stopId ? { ...stop, ...updates } : stop));
  };
  const patchItem = (itemId: string, updates: Partial<JobItem>) => {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, ...updates } : item));
  };
  const toggleCrew = (employeeId: string, checked: boolean) => {
    setCrewIds((current) => checked ? [...current.filter((id) => id !== employeeId), employeeId] : current.filter((id) => id !== employeeId));
  };

  const bookReady = Boolean(customerName.trim() && stops[0]?.address?.trim() && slot && (laborOnly || vehicleId) && !crewShort && !assemblyFull);

  return (
    <OperationsShell
      title="New Job"
      eyebrow="Operations"
      actions={
        <Button asChild variant="outline">
          <Link href="/jobs">
            <ArrowLeft className="size-4" />
            Jobs
          </Link>
        </Button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* 1. What */}
          <Card>
            <CardHeader>
              <CardTitle>1 · What</CardTitle>
              <CardDescription>Picking the service sets the vehicle, the crew floor, and which cards show up below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {serviceTypeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => chooseServiceType(option.value)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      serviceType === option.value ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50",
                    )}
                  >
                    <div className="font-semibold">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{serviceHints[option.value]}</div>
                  </button>
                ))}
              </div>
              {serviceType === "moving" && (
                <div className="flex flex-wrap gap-2">
                  {movingKinds.map((kind) => (
                    <Chip key={kind} active={movingKind === kind} onClick={() => chooseMovingKind(kind)}>
                      {movingKindLabels[kind]}
                    </Chip>
                  ))}
                </div>
              )}
              {serviceType === "delivery" && (
                <div className="flex flex-wrap gap-2">
                  {deliveryKinds.map((kind) => (
                    <Chip key={kind} active={deliveryKind === kind} onClick={() => setDeliveryKind(kind)}>
                      {deliveryKindLabels[kind]}
                    </Chip>
                  ))}
                </div>
              )}
              {serviceType === "other" && <Field label="What is the job?" value={jobLabel} onChange={setJobLabel} />}
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">Crew floor {crewFloor}</Badge>
                {neededClass && <Badge variant="secondary">{neededClass === "box_truck" ? "Box truck" : "Van"}</Badge>}
                {laborOnly && <Badge variant="secondary">No truck · full payment at booking</Badge>}
                {fullDay && <Badge variant="secondary">Full day · both truck halves</Badge>}
                {serviceType === "moving" && MOVING_INCLUDED_HOURS[movingKind] && <Badge variant="secondary">{MOVING_INCLUDED_HOURS[movingKind]} h included</Badge>}
                {isAssembly && <Badge variant="secondary">1 assembly job per day</Badge>}
              </div>
            </CardContent>
          </Card>

          {/* 2. Who */}
          <Card>
            <CardHeader>
              <CardTitle>2 · Who</CardTitle>
              <CardDescription>Start typing to pick a client or a Thumbtack lead instead of re-keying it.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <CustomerPicker value={customerName} onChange={(value) => { setCustomerName(value); setClientId(undefined); }} onPickClient={applyClient} onPickLead={applyLead} />
              <Field label="Phone" value={phone} onChange={setPhone} />
              <Field label="Email" value={email} onChange={setEmail} />
              <SelectField label="Lead source" value={leadSource} onValueChange={(value) => setLeadSource(value as JobLeadSource)} options={leadSourceOptions} />
              {(clientId || leadRef?.negotiationId) && (
                <div className="text-xs text-muted-foreground md:col-span-2">
                  {clientId ? "Linked to the client record." : "Linked to the Thumbtack conversation."}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3. Where */}
          <Card>
            <CardHeader>
              <CardTitle>3 · Where</CardTitle>
              <CardDescription>Stops are saved on the ticket and reach the crew's phones.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stops.map((stop, index) => (
                <div key={stop.id} className="rounded-lg border border-border p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="font-semibold">{stopTitle(stop, index)}</div>
                    <div className="flex items-center gap-2">
                      {index > 1 && (
                        <Select value={stop.stopType === "disposal" ? "service" : stop.stopType} onValueChange={(value) => patchStop(stop.id, { stopType: value as CustomerJobStopType })}>
                          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {stopTypes.map((value) => <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <Button variant="ghost" size="sm" disabled={stops.length === 1} onClick={() => { stopsTouched.current = true; setStops((current) => current.filter((item) => item.id !== stop.id)); }}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-6">
                    <div className="md:col-span-3"><Field label="Address" value={stop.address ?? ""} onChange={(value) => patchStop(stop.id, { address: value })} /></div>
                    <div className="md:col-span-2"><Field label="City" value={stop.city ?? ""} onChange={(value) => patchStop(stop.id, { city: value })} /></div>
                    <Field label="ZIP" value={stop.zip ?? ""} onChange={(value) => patchStop(stop.id, { zip: value })} />
                    <div className="md:col-span-2"><Field label="Contact name" value={stop.contactName ?? ""} onChange={(value) => patchStop(stop.id, { contactName: value })} /></div>
                    <div className="md:col-span-2"><Field label="Contact phone" value={stop.contactPhone ?? ""} onChange={(value) => patchStop(stop.id, { contactPhone: value })} /></div>
                    <Field label="Flights of stairs" type="number" value={String(stop.flights ?? 0)} onChange={(value) => patchStop(stop.id, { flights: Math.max(0, Number(value || 0)) })} />
                    <div className="flex items-end pb-2">
                      <Flag label="Elevator" checked={Boolean(stop.elevator)} onChange={(checked) => patchStop(stop.id, { elevator: checked })} />
                    </div>
                    <div className="md:col-span-3"><Field label="Parking / access" value={stop.parkingNotes ?? ""} onChange={(value) => patchStop(stop.id, { parkingNotes: value })} /></div>
                    <div className="md:col-span-3"><Field label="Instructions for the crew" value={stop.instructions ?? ""} onChange={(value) => patchStop(stop.id, { instructions: value })} /></div>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => { stopsTouched.current = true; setStops((current) => [...current, newStop(current.length + 1)]); }}>
                  <Plus className="size-4" />
                  Add stop
                </Button>
                {stops.some((stop) => stop.stopType === "pickup") && (
                  <Flag label="Pickup is at a seller / store / third party (full payment at booking)" checked={thirdPartyPickup} onChange={setThirdPartyPickup} />
                )}
              </div>
              {stops.length > 2 && <p className="text-sm text-amber-700">Ops rule: multi-stop jobs are separate schedule blocks — more than two stops usually means two tickets.</p>}

              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">Items</div>
                    <div className="text-xs text-muted-foreground">Optional checklist for the crew. Comes over from an estimate automatically.</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setItems((current) => [...current, newItem(stops[0]?.id)])}>
                    <Plus className="size-4" />
                    Add item
                  </Button>
                </div>
                {items.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[minmax(0,1fr)_80px_150px_auto_auto]">
                    <Input placeholder="Item" value={item.name} onChange={(event) => patchItem(item.id, { name: event.target.value })} />
                    <Input type="number" min={1} value={String(item.quantity)} onChange={(event) => patchItem(item.id, { quantity: Math.max(1, Number(event.target.value || 1)) })} />
                    <Select value={item.stopId ?? "none"} onValueChange={(value) => patchItem(item.id, { stopId: value === "none" ? undefined : value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Any stop</SelectItem>
                        {stops.map((stop, index) => <SelectItem key={stop.id} value={stop.id}>{stopTitle(stop, index)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap items-center gap-3">
                      <Flag label="Heavy" checked={item.heavy} onChange={(checked) => patchItem(item.id, { heavy: checked })} />
                      <Flag label="Take apart" checked={item.disassemblyRequired} onChange={(checked) => patchItem(item.id, { disassemblyRequired: checked })} />
                      <Flag label="Reassemble" checked={item.reassemblyRequired} onChange={(checked) => patchItem(item.id, { reassemblyRequired: checked })} />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 4. When */}
          <Card>
            <CardHeader>
              <CardTitle>4 · When</CardTitle>
              <CardDescription>Pick a half-day. The slot sets the arrival window and the vehicle.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => shiftDay(-1)}><ChevronLeft className="size-4" /></Button>
                <Input type="date" className="w-44" value={date} onChange={(event) => { setDate(event.target.value); }} />
                <Button variant="outline" size="icon" onClick={() => shiftDay(1)}><ChevronRight className="size-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => setDate(toDateInputValue(new Date()))}>Today</Button>
                {day && <span className="text-sm font-medium">{dayFmt.format(day)}</span>}
                {dayType && (
                  <Badge variant={dayType === "weekend" ? "default" : "secondary"}>{dayType === "weekend" ? "Weekend rate" : "Weekday rate"}</Badge>
                )}
              </div>

              {day && board && (
                <SlotBoard
                  day={day}
                  board={board}
                  selected={slotKey}
                  neededClass={neededClass}
                  fullDay={fullDay}
                  onPick={pickSlot}
                />
              )}

              {day && board && (
                <div className={cn("flex items-center justify-between rounded-md border px-3 py-2 text-sm", assemblyFull ? "border-amber-200 bg-amber-50 text-amber-900" : "border-border")}>
                  <span className="font-medium">Assembly tech</span>
                  <span>{board.assemblyJobs.length >= ASSEMBLY_JOBS_PER_DAY ? `Fully booked · ${board.assemblyJobs.map((job) => job.customerName).join(", ")}` : "Open"}</span>
                </div>
              )}

              {slot && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Vehicle</Label>
                    <Select value={vehicleId ?? "none"} onValueChange={(value) => setVehicleId(value === "none" ? undefined : value)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{laborOnly ? "No truck (labor only)" : "Pick a unit"}</SelectItem>
                        {slotVehicles.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>{vehicleUnitCode(vehicle)} · {vehicle.vehicleName.replace(/^[A-Z]{2,4}-\d{2} · /, "")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Arrival window</Label>
                    <div className="rounded-md border border-border px-3 py-2 text-sm">
                      {window_ ? `${timeLabel(window_.start)} – ${timeLabel(window_.end)}` : "—"}
                      {fullDay && <span className="text-muted-foreground"> · full day</span>}
                    </div>
                  </div>
                </div>
              )}

              <Reminders day={day} slot={slot} neededClass={neededClass} />
            </CardContent>
          </Card>

          {/* 5. Crew */}
          <Card>
            <CardHeader>
              <CardTitle>5 · Crew</CardTitle>
              <CardDescription>The floor comes from the safety rules. You can raise it, never lower it. First pick is the lead.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label>Required crew (floor {crewFloor})</Label>
                  <Input type="number" min={crewFloor} className="w-28" value={crewOverride || String(crewFloor)} onChange={(event) => setCrewOverride(event.target.value)} />
                </div>
                <p className={cn("pb-2 text-sm", crewShort ? "text-amber-700" : "text-muted-foreground")}>
                  {crew.length} of {requiredCrew} assigned{crewShort ? " — “Book it” needs the full crew" : ""}
                </p>
              </div>
              {employees.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No active employees yet. Add them on the <Link href="/employees" className="underline">Employees</Link> page.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {employees.map((employee) => {
                    const position = crewIds.indexOf(employee.id);
                    return (
                      <label key={employee.id} className={cn("flex items-center gap-3 rounded-md border px-3 py-2 text-sm", position >= 0 ? "border-primary bg-primary/5" : "border-border")}>
                        <Checkbox checked={position >= 0} onCheckedChange={(value) => toggleCrew(employee.id, Boolean(value))} />
                        <span className="flex-1">{employeeLabel(employee)}</span>
                        {position === 0 && <Badge>Lead</Badge>}
                        {position > 0 && (
                          <Button variant="ghost" size="sm" type="button" onClick={(event) => { event.preventDefault(); setCrewIds((current) => [employee.id, ...current.filter((id) => id !== employee.id)]); }}>
                            Make lead
                          </Button>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 7. Notes */}
          <Card>
            <CardHeader>
              <CardTitle>7 · Notes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Area label="Customer-visible notes" value={notes} onChange={setNotes} />
              <Area label="Internal dispatch notes" value={internalNotes} onChange={setInternalNotes} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          {/* 6. Price */}
          <Card>
            <CardHeader>
              <CardTitle>6 · Price</CardTitle>
              <CardDescription>Not required for a draft. Drivers never see these numbers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" className="w-full" onClick={() => setEstimatePickerOpen(true)}>
                <FileText className="size-4" />
                {sourceEstimateId ? "Linked to an estimate · change" : "From estimate"}
              </Button>
              <Field label="Quoted amount" type="number" value={quotedAmount} onChange={(value) => { setQuotedAmount(value); if (quote?.source === "estimate") setQuote(undefined); }} />
              {quote && (
                <div className="text-xs text-muted-foreground">
                  {quote.tier}: {currency.format(quote.low)}{quote.high !== quote.low ? ` – ${currency.format(quote.high)}` : ""} · from {quote.source}
                </div>
              )}
              {isOwner && <Field label="Estimated cost" type="number" value={estimatedCost} onChange={setEstimatedCost} />}
              {isOwner && <Field label="Estimated profit" type="number" value={estimatedProfit} onChange={setEstimatedProfit} />}
              <div className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Payment terms</div>
                {paymentTerms === "full_upfront" ? "Full payment at booking" : "$50 deposit, balance on the day"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <Summary
                serviceLabel={serviceType === "moving" ? movingKindLabels[movingKind] : serviceType === "delivery" ? deliveryKindLabels[deliveryKind] : serviceTypeOptions.find((option) => option.value === serviceType)?.label ?? ""}
                day={day}
                slot={slot}
                fullDay={fullDay}
                vehicle={selectedVehicle ? vehicleUnitCode(selectedVehicle) : laborOnly ? "No truck" : undefined}
                crew={crew.length}
                requiredCrew={requiredCrew}
                employees={employees}
                crewIds={crewIds}
              />
              <div className="grid gap-2">
                <Button onClick={() => void save("book")} disabled={!bookReady} title={bookReady ? undefined : "Needs customer, address, slot, vehicle and full crew"}>
                  <CalendarDays className="size-4" />
                  Book it
                </Button>
                <Button variant="outline" onClick={() => void save("draft")}>Save draft</Button>
                <Button variant="ghost" asChild>
                  <Link href="/jobs">Cancel</Link>
                </Button>
              </div>
              {!bookReady && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {!customerName.trim() && <li>· Customer name</li>}
                  {!stops[0]?.address?.trim() && <li>· {stopTitle(stops[0] ?? newStop(1), 0)} address</li>}
                  {!slot && <li>· A slot</li>}
                  {slot && !laborOnly && !vehicleId && <li>· A vehicle</li>}
                  {crewShort && <li>· {requiredCrew - crew.length} more on the crew</li>}
                  {assemblyFull && <li>· Assembly tech is booked that day</li>}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <EstimatePicker open={estimatePickerOpen} onOpenChange={setEstimatePickerOpen} onPick={applyEstimate} />
    </OperationsShell>
  );
}

// ---------------------------------------------------------------------------
// Slot board — the mini calendar for one day
// ---------------------------------------------------------------------------

function SlotBoard({
  day,
  board,
  selected,
  neededClass,
  fullDay,
  onPick,
}: {
  day: Date;
  board: ReturnType<typeof buildDayBoard>;
  selected: SlotKey | undefined;
  neededClass: "van" | "box_truck" | undefined;
  fullDay: boolean;
  onPick: (slot: DailySlot) => void;
}) {
  const rows = [...DAILY_SLOTS].sort((a, b) => (a.vehicleClass === b.vehicleClass ? 0 : a.vehicleClass === "box_truck" ? -1 : 1));
  const past = day < new Date(new Date().setHours(0, 0, 0, 0));
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map((slot) => {
        const taken = board.bySlot[slot.key];
        const isSelected = selected === slot.key;
        const blockedByFullDay = fullDay && selected === "am_box_truck" && slot.key === "pm_box_truck";
        const wrongClass = neededClass !== undefined && slot.vehicleClass !== neededClass;
        const pmOnlyFullDay = fullDay && slot.key === "pm_box_truck";
        const disabled = taken.length > 0 || pmOnlyFullDay || past;
        return (
          <button
            key={slot.key}
            type="button"
            disabled={disabled && !isSelected}
            onClick={() => onPick(slot)}
            className={cn(
              "flex min-h-16 flex-col items-start justify-between rounded-lg border p-3 text-left transition-colors",
              isSelected || blockedByFullDay ? "border-primary bg-primary/10" : "border-border",
              !disabled && !isSelected && "hover:bg-muted/50",
              disabled && !isSelected && "cursor-not-allowed opacity-60",
              wrongClass && !disabled && "border-dashed",
            )}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="font-semibold">{slot.label}</span>
              <span className="text-xs text-muted-foreground">{slot.windowStart.replace(/^0/, "")}–{slot.windowEnd}</span>
            </div>
            <div className="text-xs">
              {taken.length > 0 ? (
                <span className="text-muted-foreground">Taken · {taken.map((job) => job.customerName).join(", ")}</span>
              ) : blockedByFullDay ? (
                <span className="text-primary">Blocked by this full-day job</span>
              ) : pmOnlyFullDay ? (
                <span className="text-muted-foreground">Full-day jobs start in the morning</span>
              ) : past ? (
                <span className="text-muted-foreground">Past</span>
              ) : wrongClass ? (
                <span className="text-muted-foreground">Open · usually the {neededClass === "box_truck" ? "box truck" : "van"} for this job</span>
              ) : (
                <span className="text-emerald-700">Open</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Reminders({ day, slot, neededClass }: { day: Date | undefined; slot: DailySlot | undefined; neededClass: "van" | "box_truck" | undefined }) {
  if (!day) return null;
  const notes: string[] = [];
  if (sameDay(day, new Date())) notes.push("Same-day booking — same-day surcharge applies.");
  if (day.getDay() === 0) notes.push("Sunday — Sunday surcharge applies.");
  if (slot && Number(slot.windowEnd.split(":")[0]) >= 18) notes.push("After 6 PM — evening surcharge applies.");
  if (slot && neededClass && slot.vehicleClass !== neededClass) notes.push(`This job normally books on the ${neededClass === "box_truck" ? "box truck" : "van"} — double-check the unit.`);
  if (notes.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {notes.map((note) => <li key={note}>{note}</li>)}
    </ul>
  );
}

function Summary({
  serviceLabel,
  day,
  slot,
  fullDay,
  vehicle,
  crew,
  requiredCrew,
  employees,
  crewIds,
}: {
  serviceLabel: string;
  day: Date | undefined;
  slot: DailySlot | undefined;
  fullDay: boolean;
  vehicle: string | undefined;
  crew: number;
  requiredCrew: number;
  employees: EmployeeRecord[];
  crewIds: string[];
}) {
  const names = crewIds.map((id) => employees.find((employee) => employee.id === id)).filter(Boolean).map((employee) => `${employee!.firstName} ${employee!.lastName.charAt(0)}.`);
  return (
    <dl className="space-y-1 text-sm">
      <Row label="Service" value={serviceLabel} />
      <Row label="When" value={day && slot ? `${shortDayFmt.format(day)} · ${slot.shortLabel}${fullDay ? " (full day)" : ""}` : day ? shortDayFmt.format(day) : "—"} />
      <Row label="Vehicle" value={vehicle ?? "—"} />
      <Row label="Crew" value={`${crew}/${requiredCrew}${names.length ? ` · ${names.join(", ")}` : ""}`} />
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer type-ahead (clients + Thumbtack leads)
// ---------------------------------------------------------------------------

function CustomerPicker({
  value,
  onChange,
  onPickClient,
  onPickLead,
}: {
  value: string;
  onChange: (value: string) => void;
  onPickClient: (client: ClientRecord) => void;
  onPickLead: (lead: ThumbtackLead) => void;
}) {
  const [focused, setFocused] = useState(false);
  const query = value.trim().toLowerCase();
  const digits = value.replace(/\D/g, "");
  const results = useMemo(() => {
    if (query.length < 2) return { clients: [] as ClientRecord[], leads: [] as ThumbtackLead[] };
    const matches = (text: string | null | undefined) => Boolean(text && text.toLowerCase().includes(query));
    const matchesPhone = (text: string | null | undefined) => digits.length >= 4 && Boolean(text && text.replace(/\D/g, "").includes(digits));
    const clients = getClients()
      .filter((client) => matches(`${client.firstName} ${client.lastName}`) || matches(client.company) || matchesPhone(client.phone) || matches(client.email))
      .slice(0, 5);
    const leads = getThumbtackLeads()
      .filter((lead) => matches(lead.name) || matchesPhone(lead.phone) || matches(lead.email))
      .slice(0, 5);
    return { clients, leads };
  }, [query, digits]);
  const open = focused && (results.clients.length > 0 || results.leads.length > 0);

  return (
    <div className="relative space-y-2">
      <Label>Customer name</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        placeholder="Name, phone or email"
        autoComplete="off"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {results.clients.length > 0 && <div className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">Clients</div>}
          {results.clients.map((client) => (
            <button key={client.id} type="button" className="flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => { onPickClient(client); setFocused(false); }}>
              <span className="font-medium">{`${client.firstName} ${client.lastName}`.trim() || client.company}</span>
              <span className="text-xs text-muted-foreground">{[client.phone, client.city].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
          {results.leads.length > 0 && <div className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">Leads</div>}
          {results.leads.map((lead) => (
            <button key={lead.negotiationId} type="button" className="flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => { onPickLead(lead); setFocused(false); }}>
              <span className="font-medium">{lead.name}</span>
              <span className="text-xs text-muted-foreground">{[lead.source === "thumbtack" ? "Thumbtack" : "Direct", lead.category, lead.city, lead.status].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved-estimate picker
// ---------------------------------------------------------------------------

function EstimatePicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (estimate: SavedEstimate) => void }) {
  const [query, setQuery] = useState("");
  const estimates = useMemo(() => (open ? loadSavedEstimates() : []), [open]);
  const filtered = estimates.filter((estimate) => {
    const text = `${estimate.customerName ?? ""} ${estimate.jobAddress ?? ""} ${estimate.loadLabel ?? ""}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>From estimate</DialogTitle>
          <DialogDescription>Copies the customer, stops, items, crew size and quote onto this ticket.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search saved estimates" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="max-h-80 space-y-1 overflow-auto">
          {filtered.length === 0 && <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No saved estimates match.</div>}
          {filtered.map((estimate) => {
            const linked = getJobByEstimateId(estimate.id);
            return (
              <button key={estimate.id} type="button" className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => onPick(estimate)}>
                <div className="min-w-0">
                  <div className="truncate font-medium">{estimate.customerName || "Unnamed"} <span className="text-muted-foreground">· {estimate.mode ?? "junk"}</span></div>
                  <div className="truncate text-xs text-muted-foreground">{estimate.jobAddress || "No address"}{estimate.deliveryAddress ? ` → ${estimate.deliveryAddress}` : ""}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold">{currency.format(estimate.finalQuote)}</div>
                  <div className="text-xs text-muted-foreground">{linked ? `Job ${linked.jobNumber}` : new Date(estimate.createdAt).toLocaleDateString()}</div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function sortCrew(list: EmployeeRecord[]) {
  return [...list].sort((a, b) => Number(b.fieldTech) - Number(a.fieldTech) || a.firstName.localeCompare(b.firstName));
}

function quoteTier(input: { serviceType: CanonicalJobServiceType; movingKind?: MovingKind; deliveryKind?: DeliveryKind }) {
  if (input.serviceType === "moving" && input.movingKind) return movingKindLabels[input.movingKind];
  if (input.serviceType === "delivery" && input.deliveryKind) return deliveryKindLabels[input.deliveryKind];
  return serviceTypeOptions.find((option) => option.value === input.serviceType)?.label ?? input.serviceType;
}

function timeLabel(value: Date) {
  return value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full border px-3 py-1 text-sm transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted/50")}
    >
      {children}
    </button>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} />
    </div>
  );
}

function SelectField({ label, value, onValueChange, options }: { label: string; value: string; onValueChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Flag({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      {label}
    </label>
  );
}
