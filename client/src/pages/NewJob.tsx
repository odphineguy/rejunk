import { useStaffSession } from "@/hooks/useStaffSession";
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Copy, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { OperationsShell } from "@/components/OperationsShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createDispatchJob,
  employeeLabel,
  employeeOptions,
  leadSourceOptions,
  serviceTypeOptions,
  type DispatchAssignmentInput,
} from "@/lib/dispatchOperations";
import { fleetVehicles, vehicleUnitCode } from "@/lib/fleet";
import { crewFromRoles, defaultStopsFor, deliveryKindLabels, deliveryKinds, isFullDayMove, movingKindLabels, movingKinds, requiredCrewFor } from "@/lib/jobShape";
import { defaultVehicleForSlot, getSlot } from "@/lib/scheduleSlots";
import { loadPricingSettings } from "@/utils/pricingStorage";
import type { CustomerJobStopType, JobItem, JobStop } from "@/types/driver";
import type { CanonicalJobServiceType, DeliveryKind, JobLeadSource, JobPriority, MovingKind } from "@/types/jobs";

const stopTypes: CustomerJobStopType[] = ["pickup", "delivery", "service", "material_pickup", "other"];
const priorities: JobPriority[] = ["low", "normal", "high", "urgent"];

function uid(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newStop(order: number): JobStop {
  const now = new Date().toISOString();
  return {
    id: uid("stop"),
    jobId: "",
    stopOrder: order,
    stopType: "other",
    name: `Stop ${order}`,
    state: "AZ",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

function newItem(stopId: string): JobItem {
  const now = new Date().toISOString();
  return {
    id: uid("item"),
    jobId: "",
    stopId,
    name: "Item",
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

export default function NewJob() {
  const { isOwner } = useStaffSession();
  const [, navigate] = useLocation();
  const employees = useMemo(() => employeeOptions(), []);
  // Fleet units only (SPR-01 … BOX-01) — never the pricing templates.
  const vehicles = useMemo(() => fleetVehicles(loadPricingSettings().vehicles), []);
  // Prefill from the Schedule page ("Open · Book" on a slot): /jobs/new?date=YYYY-MM-DD&slot=am_van
  const prefill = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const slot = getSlot(params.get("slot"));
    const date = params.get("date") ?? "";
    const vehicle = slot ? defaultVehicleForSlot(slot, vehicles) : undefined;
    return { date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "", slot, vehicle };
  }, [vehicles]);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [leadSource, setLeadSource] = useState<JobLeadSource>("phone");
  const [serviceType, setServiceType] = useState<CanonicalJobServiceType>("moving");
  const [movingKind, setMovingKind] = useState<MovingKind>("studio_1br");
  const [deliveryKind, setDeliveryKind] = useState<DeliveryKind>("van_flat");
  const [crewOverride, setCrewOverride] = useState("");
  const [jobLabel, setJobLabel] = useState("");
  const [scheduledDate, setScheduledDate] = useState(prefill.date);
  const [windowStart, setWindowStart] = useState(prefill.slot?.windowStart ?? "");
  const [windowEnd, setWindowEnd] = useState(prefill.slot?.windowEnd ?? "");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [priority, setPriority] = useState<JobPriority>("normal");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState("120");
  const [quotedAmount, setQuotedAmount] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [estimatedProfit, setEstimatedProfit] = useState("");
  const [stops, setStops] = useState<JobStop[]>(() => defaultStopsFor("moving", "studio_1br"));
  // Stops untouched by the dispatcher follow the service type (pickup + delivery vs one service card).
  const stopsTouched = useMemo(() => ({ current: false }), []);
  const [items, setItems] = useState<JobItem[]>([]);
  const [assignment, setAssignment] = useState<DispatchAssignmentInput>({
    helperIds: [],
    crewSequence: 1,
    vehicleId: prefill.vehicle?.id,
    vehicleName: prefill.vehicle?.vehicleName,
  });

  const crewFloor = requiredCrewFor({ serviceType, movingKind: serviceType === "moving" ? movingKind : undefined, deliveryKind: serviceType === "delivery" ? deliveryKind : undefined });
  const requiredCrew = Math.max(crewFloor, Number(crewOverride || 0));
  const plannedCrew = crewFromRoles(assignment).length;

  const chooseServiceType = (next: CanonicalJobServiceType, nextMovingKind = movingKind) => {
    setServiceType(next);
    if (!stopsTouched.current) setStops(defaultStopsFor(next, next === "moving" ? nextMovingKind : undefined));
  };

  const scheduledStart = scheduledDate && windowStart ? new Date(`${scheduledDate}T${windowStart}`).toISOString() : undefined;
  const scheduledEnd = scheduledDate && windowEnd ? new Date(`${scheduledDate}T${windowEnd}`).toISOString() : undefined;

  const save = async (mode: "draft" | "assign" | "open") => {
    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (stops.length === 0 || !stops[0].name.trim()) {
      toast.error("At least one stop is required");
      return;
    }
    if (mode !== "draft" && plannedCrew < requiredCrew) {
      toast.error(`This job needs ${requiredCrew} on the crew — ${plannedCrew} assigned. Save as a draft or add crew.`);
      return;
    }
    const profit = Number(estimatedProfit || 0);
    const quote = Number(quotedAmount || 0);
    const job = await createDispatchJob({
      customerName,
      phone,
      email,
      leadSource,
      serviceType,
      movingKind: serviceType === "moving" ? movingKind : undefined,
      deliveryKind: serviceType === "delivery" ? deliveryKind : undefined,
      requiredCrew,
      jobLabel,
      scheduledStart,
      scheduledEnd,
      notes,
      internalNotes,
      priority,
      estimatedDurationMinutes: Number(estimatedDurationMinutes || 0),
      quotedAmount: Number(quotedAmount || 0),
      estimatedCost: Number(estimatedCost || 0),
      estimatedProfit: profit,
      estimatedMarginDecimal: quote > 0 ? profit / quote : undefined,
      stops,
      items,
      assignment,
    }, mode === "draft" ? "draft" : "assign");
    toast.success(mode === "draft" ? "Draft saved" : "Job assigned");
    navigate(mode === "open" ? `/jobs/${job.id}` : "/jobs");
  };

  const patchStop = (stopId: string, updates: Partial<JobStop>) => {
    stopsTouched.current = true;
    setStops((current) => current.map((stop) => stop.id === stopId ? { ...stop, ...updates } : stop));
  };

  const patchItem = (itemId: string, updates: Partial<JobItem>) => {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, ...updates } : item));
  };

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === assignment.vehicleId);

  return (
    <OperationsShell
      title="Create Dispatch Job"
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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
              <CardDescription>Operational details for dispatch and field crews.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Customer name" value={customerName} onChange={setCustomerName} />
              <Field label="Phone" value={phone} onChange={setPhone} />
              <Field label="Email" value={email} onChange={setEmail} />
              <Field label="Job label/title" value={jobLabel} onChange={setJobLabel} />
              <SelectField label="Lead source" value={leadSource} onValueChange={(value) => setLeadSource(value as JobLeadSource)} options={leadSourceOptions} />
              <SelectField label="Service type" value={serviceType} onValueChange={(value) => chooseServiceType(value as CanonicalJobServiceType)} options={serviceTypeOptions} />
              {serviceType === "moving" && (
                <SelectField
                  label="Kind of move"
                  value={movingKind}
                  onValueChange={(value) => {
                    const next = value as MovingKind;
                    setMovingKind(next);
                    if (!stopsTouched.current) setStops(defaultStopsFor("moving", next));
                  }}
                  options={movingKinds.map((value) => ({ value, label: movingKindLabels[value] }))}
                />
              )}
              {serviceType === "delivery" && (
                <SelectField label="Kind of delivery" value={deliveryKind} onValueChange={(value) => setDeliveryKind(value as DeliveryKind)} options={deliveryKinds.map((value) => ({ value, label: deliveryKindLabels[value] }))} />
              )}
              {serviceType === "moving" && isFullDayMove(movingKind) && (
                <div className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  This package blocks both halves of the box truck's day (full day).
                </div>
              )}
              <Field label="Scheduled date" type="date" value={scheduledDate} onChange={setScheduledDate} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Window start" type="time" value={windowStart} onChange={setWindowStart} />
                <Field label="Window end" type="time" value={windowEnd} onChange={setWindowEnd} />
              </div>
              <SelectField label="Priority" value={priority} onValueChange={(value) => setPriority(value as JobPriority)} options={priorities.map((value) => ({ value, label: value }))} />
              <Field label="Estimated duration (min)" type="number" value={estimatedDurationMinutes} onChange={setEstimatedDurationMinutes} />
              <div className="md:col-span-2">
                <Area label="Customer-facing notes" value={notes} onChange={setNotes} />
              </div>
              <div className="md:col-span-2">
                <Area label="Internal dispatch notes" value={internalNotes} onChange={setInternalNotes} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Where</CardTitle>
              <CardDescription>Moves and deliveries get a Pickup and a Delivery card; assembly and junk get one service location. Stops are saved on the ticket and reach the crew's phones.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stops.map((stop, index) => (
                <div key={stop.id} className="rounded-lg border border-border p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-semibold">
                      <GripVertical className="size-4 text-muted-foreground" />
                      {stop.stopType === "pickup" ? "Pickup" : stop.stopType === "delivery" ? "Delivery" : `Service location ${index + 1}`}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setStops((current) => reorder(current, index, index - 1))}>Up</Button>
                      <Button variant="outline" size="sm" disabled={index === stops.length - 1} onClick={() => setStops((current) => reorder(current, index, index + 1))}>Down</Button>
                      <Button variant="outline" size="sm" onClick={() => setStops((current) => [...current.slice(0, index + 1), { ...stop, id: uid("stop"), name: `${stop.name} copy` }, ...current.slice(index + 1)])}>
                        <Copy className="size-4" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={stops.length === 1} onClick={() => { stopsTouched.current = true; setStops((current) => current.filter((item) => item.id !== stop.id)); }}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <SelectField label="Stop type" value={stop.stopType === "disposal" ? "service" : stop.stopType} onValueChange={(value) => patchStop(stop.id, { stopType: value as CustomerJobStopType })} options={stopTypes.map((value) => ({ value, label: value.replaceAll("_", " ") }))} />
                    <Field label="Stop name" value={stop.name} onChange={(value) => patchStop(stop.id, { name: value })} />
                    <Field label="Address" value={stop.address ?? ""} onChange={(value) => patchStop(stop.id, { address: value })} />
                    <Field label="City" value={stop.city ?? ""} onChange={(value) => patchStop(stop.id, { city: value })} />
                    <Field label="State" value={stop.state ?? ""} onChange={(value) => patchStop(stop.id, { state: value })} />
                    <Field label="ZIP" value={stop.zip ?? ""} onChange={(value) => patchStop(stop.id, { zip: value })} />
                    <Field label="Contact name" value={stop.contactName ?? ""} onChange={(value) => patchStop(stop.id, { contactName: value })} />
                    <Field label="Contact phone" value={stop.contactPhone ?? ""} onChange={(value) => patchStop(stop.id, { contactPhone: value })} />
                    <div className="md:col-span-2">
                      <Area label="Stop instructions" value={stop.instructions ?? ""} onChange={(value) => patchStop(stop.id, { instructions: value })} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button variant="outline" size="sm" onClick={() => setItems((current) => [...current, newItem(stop.id)])}>
                      <Plus className="size-4" />
                      Add item to stop
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => { stopsTouched.current = true; setStops((current) => [...current, newStop(current.length + 1)]); }}>
                <Plus className="size-4" />
                Add Stop
              </Button>
              {stops.length > 2 && <p className="text-sm text-amber-700">Ops rule: multi-stop jobs are separate schedule blocks — more than two stops usually means two tickets.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <CardDescription>Optional checklist. Drivers will see items without prices.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-4">
                  <div className="mb-4 flex justify-between gap-3">
                    <div className="font-semibold">{item.name}</div>
                    <Button variant="outline" size="sm" onClick={() => setItems((current) => current.filter((currentItem) => currentItem.id !== item.id))}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Name" value={item.name} onChange={(value) => patchItem(item.id, { name: value })} />
                    <Field label="Quantity" type="number" value={String(item.quantity)} onChange={(value) => patchItem(item.id, { quantity: Number(value || 1) })} />
                    <SelectField label="Stop" value={item.stopId ?? ""} onValueChange={(value) => patchItem(item.id, { stopId: value })} options={stops.map((stop) => ({ value: stop.id, label: `${stop.stopOrder}. ${stop.name}` }))} />
                    <Field label="Category" value={item.category ?? ""} onChange={(value) => patchItem(item.id, { category: value })} />
                    <Field label="Estimated weight" type="number" value={String(item.estimatedWeightLbs ?? "")} onChange={(value) => patchItem(item.id, { estimatedWeightLbs: Number(value || 0) })} />
                    <SelectField label="Destination stop" value={item.destinationStopId ?? "none"} onValueChange={(value) => patchItem(item.id, { destinationStopId: value === "none" ? undefined : value })} options={[{ value: "none", label: "None" }, ...stops.map((stop) => ({ value: stop.id, label: `${stop.stopOrder}. ${stop.name}` }))]} />
                    <Flag label="Oversized" checked={item.oversized} onChange={(checked) => patchItem(item.id, { oversized: checked })} />
                    <Flag label="Heavy" checked={item.heavy} onChange={(checked) => patchItem(item.id, { heavy: checked })} />
                    <Flag label="Fragile" checked={item.fragile} onChange={(checked) => patchItem(item.id, { fragile: checked })} />
                    <Flag label="Disassembly" checked={item.disassemblyRequired} onChange={(checked) => patchItem(item.id, { disassemblyRequired: checked })} />
                    <Flag label="Reassembly" checked={item.reassemblyRequired} onChange={(checked) => patchItem(item.id, { reassemblyRequired: checked })} />
                    <div className="md:col-span-2">
                      <Area label="Instructions" value={item.instructions ?? ""} onChange={(value) => patchItem(item.id, { instructions: value })} />
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No detailed item list yet. Add items if the crew needs a checklist.</div>}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SelectField label="Crew lead" value={assignment.crewLeadId ?? "none"} onValueChange={(value) => setAssignment((current) => ({ ...current, crewLeadId: value === "none" ? undefined : value }))} options={[{ value: "none", label: "Unassigned" }, ...employees.map((employee) => ({ value: employee.id, label: employeeLabel(employee) }))]} />
              <SelectField label="Driver" value={assignment.driverId ?? "none"} onValueChange={(value) => setAssignment((current) => ({ ...current, driverId: value === "none" ? undefined : value }))} options={[{ value: "none", label: "Unassigned" }, ...employees.map((employee) => ({ value: employee.id, label: employeeLabel(employee) }))]} />
              <SelectField label="Vehicle" value={assignment.vehicleId ?? "none"} onValueChange={(value) => setAssignment((current) => ({ ...current, vehicleId: value === "none" ? undefined : value, vehicleName: value === "none" ? undefined : vehicles.find((vehicle) => vehicle.id === value)?.vehicleName }))} options={[{ value: "none", label: "No vehicle" }, ...vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicleUnitCode(vehicle)} · ${vehicle.vehicleName.replace(/^[A-Z]{2,4}-\d{2} · /, "")}` }))]} />
              <div className="space-y-2">
                <Label>Required crew (floor {crewFloor})</Label>
                <Input type="number" min={crewFloor} value={crewOverride || String(crewFloor)} onChange={(event) => setCrewOverride(event.target.value)} />
                <p className={plannedCrew < requiredCrew ? "text-xs text-amber-700" : "text-xs text-muted-foreground"}>
                  {plannedCrew} of {requiredCrew} assigned{plannedCrew < requiredCrew ? " — “Save and Assign” needs the full crew" : ""}
                </p>
              </div>
              <Field label="Crew sequence" type="number" value={String(assignment.crewSequence ?? 1)} onChange={(value) => setAssignment((current) => ({ ...current, crewSequence: Number(value || 1) }))} />
              <div className="space-y-2">
                <Label>Helpers</Label>
                <div className="space-y-2 rounded-md border border-border p-3">
                  {employees.map((employee) => (
                    <Flag
                      key={employee.id}
                      label={employeeLabel(employee)}
                      checked={assignment.helperIds.includes(employee.id)}
                      onChange={(checked) => setAssignment((current) => ({ ...current, helperIds: checked ? [...current.helperIds, employee.id] : current.helperIds.filter((id) => id !== employee.id) }))}
                    />
                  ))}
                </div>
              </div>
              <Badge variant="secondary">{selectedVehicle ? vehicleUnitCode(selectedVehicle) : "No vehicle selected"}</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
              <CardDescription>Dispatch-only. These values are not sent to driver screens.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Quoted amount" type="number" value={quotedAmount} onChange={setQuotedAmount} />
              {isOwner && <Field label="Estimated cost" type="number" value={estimatedCost} onChange={setEstimatedCost} />}
              {isOwner && <Field label="Estimated profit" type="number" value={estimatedProfit} onChange={setEstimatedProfit} />}
            </CardContent>
          </Card>

          <div className="grid gap-2">
            <Button onClick={() => void save("assign")}>
              <Save className="size-4" />
              Save and Assign
            </Button>
            <Button variant="outline" onClick={() => void save("open")}>Save and Open Job</Button>
            <Button variant="outline" onClick={() => void save("draft")}>Save Draft</Button>
            <Button variant="ghost" asChild>
              <Link href="/jobs">Cancel</Link>
            </Button>
          </div>
        </aside>
      </div>
    </OperationsShell>
  );
}

function reorder<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((entry, index) => ({ ...entry, stopOrder: index + 1 }));
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
