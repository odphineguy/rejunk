import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, Save, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { defaultPricingSettings } from "@/data/defaultPricing";
import { facilityTypeLabels } from "@/data/facilities";
import {
  loadPricingSettings,
  resetDisposalFacilities,
  resetMaterialPricingRules,
  resetVehicles,
  savePricingSettings,
} from "@/utils/pricingStorage";
import type {
  Facility,
  FacilityPriceType,
  FacilityType,
  MaterialCategory,
  MaterialHandlingClass,
  MaterialPricingMode,
  MaterialPricingRule,
  PricingSettings,
  Vehicle,
  VehicleType,
} from "@/types/pricing";

const facilityTypes: FacilityType[] = [
  "landfill",
  "transfer_station",
  "recycling_center",
  "specialty_facility",
  "scrap_yard",
  "green_waste",
  "clean_fill",
];

const priceTypes: FacilityPriceType[] = ["per_ton", "flat_fee", "per_item", "free", "payout"];
const vehicleTypes: VehicleType[] = ["cargo_van", "box_truck", "dump_trailer", "pickup_truck", "passenger_van", "other"];
const pricingModes: MaterialPricingMode[] = ["volume_based", "weight_based", "item_based", "hybrid", "payout", "excluded"];
const handlingClasses: MaterialHandlingClass[] = ["standard_junk", "heavy_lowboy", "green_waste", "mixed_demo", "metal_appliance"];

const materialCategories: MaterialCategory[] = [
  "household_junk",
  "furniture",
  "appliances",
  "mattresses",
  "tires",
  "mixed_c_and_d",
  "clean_concrete",
  "clean_tile",
  "brick",
  "dirt",
  "rock",
  "asphalt",
  "pavers",
  "heavy_clean_debris",
  "green_waste",
  "metal",
  "cardboard",
  "hazardous_excluded",
];

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function idFor(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`;
}

function numeric(value: string | number | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function updateArrayValue<T>(items: T[], value: T, checked: boolean) {
  if (checked) {
    return items.includes(value) ? items : [...items, value];
  }

  return items.filter((item) => item !== value);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      <span>{label}</span>
    </label>
  );
}

function SelectList<T extends { id: string; isActive?: boolean; isDefault?: boolean }>({
  title,
  items,
  selectedId,
  onSelect,
  primaryLabel,
}: {
  title: string;
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  primaryLabel: (item: T) => string;
}) {
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{items.length} configured</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`w-full rounded-lg border p-3 text-left transition-colors ${
              item.id === selectedId ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-semibold">{primaryLabel(item)}</span>
              <div className="flex gap-1">
                {item.isDefault && <Badge>Default</Badge>}
                {item.isActive === false && <Badge variant="secondary">Inactive</Badge>}
              </div>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function normalizeFacility(facility: Facility): Facility {
  return {
    ...facility,
    name: facility.facilityName,
    type: facility.facilityType,
    lat: facility.latitude,
    lng: facility.longitude,
    description: facility.bestUseCase || facility.notes || `${facility.facilityName} disposal facility.`,
    pricing: {
      msw: `${facility.priceType === "per_item" ? "$" + facility.defaultRate + "/item" : "$" + facility.defaultRate + "/ton"} estimate`,
      minimum: `$${facility.minimumCharge} minimum estimate`,
    },
    acceptance: {
      tires: facility.acceptedMaterials.includes("tires"),
      appliances: facility.acceptedMaterials.includes("appliances"),
      recycling:
        facility.facilityType === "recycling_center" ||
        facility.acceptedMaterials.some((material) => ["metal", "cardboard", "clean_concrete", "clean_tile"].includes(material)),
      hazardousWaste: facility.acceptedMaterials.includes("hazardous_excluded"),
    },
  };
}

function newFacility(): Facility {
  return normalizeFacility({
    ...defaultPricingSettings.disposalFacilities[0],
    id: idFor("facility"),
    facilityName: "New Facility",
    address: "",
    city: "Phoenix",
    state: "AZ",
    zip: "",
    phone: "",
    website: "",
    latitude: 33.4484,
    longitude: -112.074,
    acceptedMaterials: ["household_junk"],
    rejectedMaterials: ["hazardous_excluded"],
    isDefault: false,
    isActive: true,
  });
}

function newVehicle(): Vehicle {
  return {
    id: idFor("vehicle"),
    vehicleName: "New Vehicle",
    vehicleType: "cargo_van",
    usableCubicYards: 10,
    maxPayloadLbs: 3000,
    fuelType: "gasoline",
    mpgUnloaded: 15,
    mpgLoaded: 12,
    hourlyVehicleCost: 20,
    mileageCost: 0.75,
    hasLiftgate: false,
    hasDumpCapability: false,
    requiresTowVehicle: false,
    allowedHandlingClasses: ["standard_junk", "green_waste", "mixed_demo", "metal_appliance", "heavy_lowboy"],
    bedHeightClass: "medium",
    looseDebrisSuitable: true,
    heavyMaterialSuitable: "conditional",
    notes: "",
    isDefault: false,
    isActive: true,
  };
}

function newMaterialRule(): MaterialPricingRule {
  return {
    id: idFor("material"),
    materialName: "New Material",
    materialCategory: "household_junk",
    defaultDensityLbsPerYard: 150,
    pricingMode: "hybrid",
    handlingClass: "standard_junk",
    requiresWeightOverride: false,
    preferredFacilityTypes: ["transfer_station"],
    warningText: "",
    laborDifficultyMultiplier: 1,
    disposalDifficultyMultiplier: 1,
    notes: "",
    isActive: true,
  };
}

export default function PricingSettings() {
  const [settings, setSettings] = useState<PricingSettings>(() => loadPricingSettings());
  const [selectedFacilityId, setSelectedFacilityId] = useState(settings.disposalFacilities[0]?.id ?? "");
  const [selectedVehicleId, setSelectedVehicleId] = useState(settings.vehicles[0]?.id ?? "");
  const [selectedMaterialId, setSelectedMaterialId] = useState(settings.materialPricingRules[0]?.id ?? "");

  // Refresh when Supabase hydration lands after mount (it dispatches this event),
  // so reloading on a device with no local cache shows the persisted values.
  useEffect(() => {
    const refresh = () => setSettings(loadPricingSettings());
    window.addEventListener("pricing-settings-updated", refresh);
    return () => window.removeEventListener("pricing-settings-updated", refresh);
  }, []);

  const selectedFacility = useMemo(
    () => settings.disposalFacilities.find((facility) => facility.id === selectedFacilityId) ?? settings.disposalFacilities[0],
    [selectedFacilityId, settings.disposalFacilities],
  );
  const selectedVehicle = useMemo(
    () => settings.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? settings.vehicles[0],
    [selectedVehicleId, settings.vehicles],
  );
  const selectedMaterial = useMemo(
    () => settings.materialPricingRules.find((material) => material.id === selectedMaterialId) ?? settings.materialPricingRules[0],
    [selectedMaterialId, settings.materialPricingRules],
  );

  const persist = (next: PricingSettings, message = "Settings saved") => {
    setSettings(next);
    savePricingSettings(next);
    toast.success(message);
  };

  const updateFacility = (facility: Facility) => {
    const normalized = normalizeFacility(facility);
    // A facility set as default becomes active and clears the default flag on others.
    const makeDefault = normalized.isDefault;
    persist(
      {
        ...settings,
        disposalFacilities: settings.disposalFacilities.map((item) => {
          if (item.id === normalized.id) return makeDefault ? { ...normalized, isActive: true } : normalized;
          return makeDefault ? normalizeFacility({ ...item, isDefault: false }) : item;
        }),
      },
      "Facility saved",
    );
  };

  const updateVehicle = (vehicle: Vehicle) => {
    const makeDefault = vehicle.isDefault;
    persist(
      {
        ...settings,
        vehicles: settings.vehicles.map((item) => {
          if (item.id === vehicle.id) return makeDefault ? { ...vehicle, isActive: true } : vehicle;
          return makeDefault ? { ...item, isDefault: false } : item;
        }),
      },
      "Vehicle saved",
    );
  };

  const updateMaterial = (material: MaterialPricingRule) => {
    persist(
      {
        ...settings,
        materialPricingRules: settings.materialPricingRules.map((item) => (item.id === material.id ? material : item)),
      },
      "Material rule saved",
    );
  };

  const deleteFacility = (facilityId: string) => {
    const remaining = settings.disposalFacilities.filter((facility) => facility.id !== facilityId);
    persist({ ...settings, disposalFacilities: remaining }, "Facility deleted");
    if (selectedFacilityId === facilityId) setSelectedFacilityId(remaining[0]?.id ?? "");
  };

  const deleteVehicle = (vehicleId: string) => {
    const remaining = settings.vehicles.filter((vehicle) => vehicle.id !== vehicleId);
    persist({ ...settings, vehicles: remaining }, "Vehicle deleted");
    if (selectedVehicleId === vehicleId) setSelectedVehicleId(remaining[0]?.id ?? "");
  };

  const deleteMaterial = (materialId: string) => {
    const remaining = settings.materialPricingRules.filter((material) => material.id !== materialId);
    persist({ ...settings, materialPricingRules: remaining }, "Material rule deleted");
    if (selectedMaterialId === materialId) setSelectedMaterialId(remaining[0]?.id ?? "");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background px-4 py-5 md:px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Settings className="size-4" />
          Admin
        </div>
        <h1 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">Pricing Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage the editable data used by the Estimate Builder.</p>
      </header>

      <main className="px-4 py-6 md:px-6">
        <Tabs defaultValue="facilities" className="gap-5">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="facilities">Facilities</TabsTrigger>
            <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
            <TabsTrigger value="materials">Materials</TabsTrigger>
          </TabsList>

          <TabsContent value="facilities">
            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      const facility = newFacility();
                      persist({ ...settings, disposalFacilities: [facility, ...settings.disposalFacilities] }, "Facility added");
                      setSelectedFacilityId(facility.id);
                    }}
                  >
                    <Plus className="size-4" />
                    Add Facility
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const next = resetDisposalFacilities(settings);
                      setSettings(next);
                      setSelectedFacilityId(next.disposalFacilities[0]?.id ?? "");
                      toast.success("Facilities reset to defaults");
                    }}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                </div>
                <SelectList
                  title="Disposal Facilities"
                  items={settings.disposalFacilities}
                  selectedId={selectedFacilityId}
                  onSelect={setSelectedFacilityId}
                  primaryLabel={(facility) => facility.facilityName}
                />
              </div>

              {selectedFacility && (
                <FacilityEditor
                  key={selectedFacility.id}
                  facility={selectedFacility}
                  onSave={updateFacility}
                  onDelete={() => deleteFacility(selectedFacility.id)}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="vehicles">
            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      const vehicle = newVehicle();
                      persist({ ...settings, vehicles: [vehicle, ...settings.vehicles] }, "Vehicle added");
                      setSelectedVehicleId(vehicle.id);
                    }}
                  >
                    <Plus className="size-4" />
                    Add Vehicle
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const next = resetVehicles(settings);
                      setSettings(next);
                      setSelectedVehicleId(next.vehicles[0]?.id ?? "");
                      toast.success("Vehicles reset to defaults");
                    }}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                </div>
                <SelectList
                  title="Vehicles"
                  items={settings.vehicles}
                  selectedId={selectedVehicleId}
                  onSelect={setSelectedVehicleId}
                  primaryLabel={(vehicle) => vehicle.vehicleName}
                />
              </div>

              {selectedVehicle && (
                <VehicleEditor
                  key={selectedVehicle.id}
                  vehicle={selectedVehicle}
                  onSave={updateVehicle}
                  onDelete={() => deleteVehicle(selectedVehicle.id)}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="materials">
            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      const material = newMaterialRule();
                      persist({ ...settings, materialPricingRules: [material, ...settings.materialPricingRules] }, "Material rule added");
                      setSelectedMaterialId(material.id);
                    }}
                  >
                    <Plus className="size-4" />
                    Add Rule
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const next = resetMaterialPricingRules(settings);
                      setSettings(next);
                      setSelectedMaterialId(next.materialPricingRules[0]?.id ?? "");
                      toast.success("Material rules reset to defaults");
                    }}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                </div>
                <SelectList
                  title="Material Rules"
                  items={settings.materialPricingRules}
                  selectedId={selectedMaterialId}
                  onSelect={setSelectedMaterialId}
                  primaryLabel={(material) => material.materialName}
                />
              </div>

              {selectedMaterial && (
                <MaterialEditor
                  key={selectedMaterial.id}
                  material={selectedMaterial}
                  onSave={updateMaterial}
                  onDelete={() => deleteMaterial(selectedMaterial.id)}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function FacilityEditor({ facility: initial, onSave, onDelete }: { facility: Facility; onSave: (facility: Facility) => void; onDelete: () => void }) {
  const [facility, setFacility] = useState(initial);
  const update = (patch: Partial<Facility>) => setFacility((current) => ({ ...current, ...patch }));
  const dirty = useMemo(() => JSON.stringify(facility) !== JSON.stringify(initial), [facility, initial]);
  useEffect(() => setFacility(initial), [initial]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{facility.facilityName}</CardTitle>
            <CardDescription>{facilityTypeLabels[facility.facilityType]}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4" />
              Delete
            </Button>
            <Button onClick={() => onSave(facility)} disabled={!dirty}>
              <Save className="size-4" />
              {dirty ? "Save" : "Saved"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Facility name">
            <Input value={facility.facilityName} onChange={(event) => update({ facilityName: event.target.value })} />
          </Field>
          <Field label="Facility type">
            <Select value={facility.facilityType} onValueChange={(value) => update({ facilityType: value as FacilityType })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {facilityTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {labelize(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Price type">
            <Select value={facility.priceType} onValueChange={(value) => update({ priceType: value as FacilityPriceType })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priceTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {labelize(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Address">
            <Input value={facility.address} onChange={(event) => update({ address: event.target.value })} />
          </Field>
          <Field label="City">
            <Input value={facility.city} onChange={(event) => update({ city: event.target.value })} />
          </Field>
          <Field label="State">
            <Input value={facility.state} onChange={(event) => update({ state: event.target.value })} />
          </Field>
          <Field label="ZIP">
            <Input value={facility.zip} onChange={(event) => update({ zip: event.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={facility.phone ?? ""} onChange={(event) => update({ phone: event.target.value })} />
          </Field>
          <Field label="Website">
            <Input value={facility.website ?? ""} onChange={(event) => update({ website: event.target.value })} />
          </Field>
          <Field label="Default rate">
            <Input type="number" min="0" step="1" value={facility.defaultRate} onChange={(event) => update({ defaultRate: numeric(event.target.value) })} />
          </Field>
          <Field label="Minimum charge">
            <Input type="number" min="0" step="1" value={facility.minimumCharge} onChange={(event) => update({ minimumCharge: numeric(event.target.value) })} />
          </Field>
          <Field label="Environmental fee">
            <Input type="number" min="0" step="1" value={facility.environmentalFee} onChange={(event) => update({ environmentalFee: numeric(event.target.value) })} />
          </Field>
          <Field label="Fuel surcharge">
            <Input type="number" min="0" step="1" value={facility.fuelSurcharge} onChange={(event) => update({ fuelSurcharge: numeric(event.target.value) })} />
          </Field>
          <Field label="Pricing impact label">
            <Input value={facility.pricingImpactLabel ?? ""} onChange={(event) => update({ pricingImpactLabel: event.target.value })} />
          </Field>
          <Field label="Last verified date">
            <Input type="date" value={facility.lastVerifiedDate ?? ""} onChange={(event) => update({ lastVerifiedDate: event.target.value })} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Best use case">
            <Textarea value={facility.bestUseCase ?? ""} onChange={(event) => update({ bestUseCase: event.target.value })} />
          </Field>
          <Field label="Notes">
            <Textarea value={facility.notes ?? ""} onChange={(event) => update({ notes: event.target.value })} />
          </Field>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <MaterialChecklist
            title="Accepted materials"
            selected={facility.acceptedMaterials}
            onChange={(materials) => update({ acceptedMaterials: materials })}
          />
          <MaterialChecklist
            title="Rejected materials"
            selected={facility.rejectedMaterials}
            onChange={(materials) => update({ rejectedMaterials: materials })}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <CheckField label="Active" checked={facility.isActive} onChange={(checked) => update({ isActive: checked })} />
          <CheckField label="Default facility" checked={facility.isDefault} onChange={(checked) => update({ isDefault: checked })} />
        </div>
      </CardContent>
    </Card>
  );
}

function VehicleEditor({ vehicle: initial, onSave, onDelete }: { vehicle: Vehicle; onSave: (vehicle: Vehicle) => void; onDelete: () => void }) {
  const [vehicle, setVehicle] = useState(initial);
  const update = (patch: Partial<Vehicle>) => setVehicle((current) => ({ ...current, ...patch }));
  const dirty = useMemo(() => JSON.stringify(vehicle) !== JSON.stringify(initial), [vehicle, initial]);
  useEffect(() => setVehicle(initial), [initial]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{vehicle.vehicleName}</CardTitle>
            <CardDescription>{labelize(vehicle.vehicleType)}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4" />
              Delete
            </Button>
            <Button onClick={() => onSave(vehicle)} disabled={!dirty}>
              <Save className="size-4" />
              {dirty ? "Save" : "Saved"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Vehicle name">
            <Input value={vehicle.vehicleName} onChange={(event) => update({ vehicleName: event.target.value })} />
          </Field>
          <Field label="Vehicle type">
            <Select value={vehicle.vehicleType} onValueChange={(value) => update({ vehicleType: value as VehicleType })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vehicleTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {labelize(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fuel type">
            <Input value={vehicle.fuelType} onChange={(event) => update({ fuelType: event.target.value })} />
          </Field>
          <Field label="Usable cubic yards">
            <Input type="number" min="0" step="0.1" value={vehicle.usableCubicYards} onChange={(event) => update({ usableCubicYards: numeric(event.target.value) })} />
          </Field>
          <Field label="Max payload lbs">
            <Input type="number" min="0" step="50" value={vehicle.maxPayloadLbs} onChange={(event) => update({ maxPayloadLbs: numeric(event.target.value) })} />
          </Field>
          <Field label="MPG unloaded">
            <Input type="number" min="0" step="0.5" value={vehicle.mpgUnloaded} onChange={(event) => update({ mpgUnloaded: numeric(event.target.value) })} />
          </Field>
          <Field label="MPG loaded">
            <Input type="number" min="0" step="0.5" value={vehicle.mpgLoaded} onChange={(event) => update({ mpgLoaded: numeric(event.target.value) })} />
          </Field>
          <Field label="Hourly vehicle cost">
            <Input type="number" min="0" step="1" value={vehicle.hourlyVehicleCost ?? 0} onChange={(event) => update({ hourlyVehicleCost: numeric(event.target.value) })} />
          </Field>
          <Field label="Mileage cost">
            <Input type="number" min="0" step="0.01" value={vehicle.mileageCost ?? 0} onChange={(event) => update({ mileageCost: numeric(event.target.value) })} />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea value={vehicle.notes ?? ""} onChange={(event) => update({ notes: event.target.value })} />
        </Field>

        <div className="flex flex-wrap gap-3">
          <CheckField label="Has liftgate" checked={vehicle.hasLiftgate} onChange={(checked) => update({ hasLiftgate: checked })} />
          <CheckField label="Has dump capability" checked={vehicle.hasDumpCapability} onChange={(checked) => update({ hasDumpCapability: checked })} />
          <CheckField label="Requires tow vehicle" checked={vehicle.requiresTowVehicle} onChange={(checked) => update({ requiresTowVehicle: checked })} />
          <CheckField label="Active" checked={vehicle.isActive} onChange={(checked) => update({ isActive: checked })} />
          <CheckField label="Default vehicle" checked={vehicle.isDefault} onChange={(checked) => update({ isDefault: checked })} />
        </div>
      </CardContent>
    </Card>
  );
}

function MaterialEditor({ material: initial, onSave, onDelete }: { material: MaterialPricingRule; onSave: (material: MaterialPricingRule) => void; onDelete: () => void }) {
  const [material, setMaterial] = useState(initial);
  const update = (patch: Partial<MaterialPricingRule>) => setMaterial((current) => ({ ...current, ...patch }));
  const dirty = useMemo(() => JSON.stringify(material) !== JSON.stringify(initial), [material, initial]);
  useEffect(() => setMaterial(initial), [initial]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{material.materialName}</CardTitle>
            <CardDescription>{labelize(material.materialCategory)}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4" />
              Delete
            </Button>
            <Button onClick={() => onSave(material)} disabled={!dirty}>
              <Save className="size-4" />
              {dirty ? "Save" : "Saved"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Material name">
            <Input value={material.materialName} onChange={(event) => update({ materialName: event.target.value })} />
          </Field>
          <Field label="Material category">
            <Select value={material.materialCategory} onValueChange={(value) => update({ materialCategory: value as MaterialCategory })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {materialCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {labelize(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Pricing mode">
            <Select value={material.pricingMode} onValueChange={(value) => update({ pricingMode: value as MaterialPricingMode })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pricingModes.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {labelize(mode)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Handling class">
            <Select value={material.handlingClass} onValueChange={(value) => update({ handlingClass: value as MaterialHandlingClass })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {handlingClasses.map((handlingClass) => (
                  <SelectItem key={handlingClass} value={handlingClass}>
                    {labelize(handlingClass)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Density lbs / yd3">
            <Input type="number" min="0" step="25" value={material.defaultDensityLbsPerYard} onChange={(event) => update({ defaultDensityLbsPerYard: numeric(event.target.value) })} />
          </Field>
          <Field label="Included tons">
            <Input type="number" min="0" step="0.25" value={material.includedTons ?? 0} onChange={(event) => update({ includedTons: numeric(event.target.value) || undefined })} />
          </Field>
          <Field label="Extra ton rate">
            <Input type="number" min="0" step="5" value={material.extraTonRate ?? 0} onChange={(event) => update({ extraTonRate: numeric(event.target.value) || undefined })} />
          </Field>
          <Field label="Labor multiplier">
            <Input type="number" min="0" step="0.05" value={material.laborDifficultyMultiplier} onChange={(event) => update({ laborDifficultyMultiplier: numeric(event.target.value, 1) })} />
          </Field>
          <Field label="Disposal multiplier">
            <Input type="number" min="0" step="0.05" value={material.disposalDifficultyMultiplier} onChange={(event) => update({ disposalDifficultyMultiplier: numeric(event.target.value, 1) })} />
          </Field>
        </div>

        <FacilityTypeChecklist
          title="Preferred facility types"
          selected={material.preferredFacilityTypes}
          onChange={(types) => update({ preferredFacilityTypes: types })}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Warning text">
            <Textarea value={material.warningText ?? ""} onChange={(event) => update({ warningText: event.target.value })} />
          </Field>
          <Field label="Notes">
            <Textarea value={material.notes ?? ""} onChange={(event) => update({ notes: event.target.value })} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-3">
          <CheckField label="Requires weight override" checked={material.requiresWeightOverride} onChange={(checked) => update({ requiresWeightOverride: checked })} />
          <CheckField label="Active" checked={material.isActive !== false} onChange={(checked) => update({ isActive: checked })} />
        </div>
      </CardContent>
    </Card>
  );
}

function MaterialChecklist({ title, selected, onChange }: { title: string; selected: MaterialCategory[]; onChange: (selected: MaterialCategory[]) => void }) {
  return (
    <div className="space-y-3">
      <Label>{title}</Label>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {materialCategories.map((category) => (
          <CheckField
            key={category}
            label={labelize(category)}
            checked={selected.includes(category)}
            onChange={(checked) => onChange(updateArrayValue(selected, category, checked))}
          />
        ))}
      </div>
    </div>
  );
}

function FacilityTypeChecklist({ title, selected, onChange }: { title: string; selected: FacilityType[]; onChange: (selected: FacilityType[]) => void }) {
  return (
    <div className="space-y-3">
      <Label>{title}</Label>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {facilityTypes.map((type) => (
          <CheckField
            key={type}
            label={labelize(type)}
            checked={selected.includes(type)}
            onChange={(checked) => onChange(updateArrayValue(selected, type, checked))}
          />
        ))}
      </div>
    </div>
  );
}
