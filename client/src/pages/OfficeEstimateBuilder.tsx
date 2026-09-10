import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ServiceEstimatePanel } from "@/components/ServiceEstimatePanel";
import { VisionEstimatePanel } from "@/components/VisionEstimatePanel";
import { getStoredStaffSession } from "@/lib/staffSession";
import {
  loadPricingSettings,
  loadSavedEstimates,
  saveEstimateConfirmed,
} from "@/utils/pricingStorage";
import { createJobFromEstimate } from "@/lib/jobStorage";
import type { SavedEstimate } from "@/types/pricing";
import { toast } from "sonner";

/** Office quoting receives customer prices; the server keeps internal costs. */
export default function OfficeEstimateBuilder() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState("junk");
  const [settings, setSettings] = useState(loadPricingSettings);
  const [saved, setSaved] = useState(loadSavedEstimates);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [delivery, setDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [materialId, setMaterial] = useState("");
  const [vehicleId, setVehicle] = useState("");
  const [facilityId, setFacility] = useState("");
  const [yards, setYards] = useState("1");
  const [weight, setWeight] = useState("");
  const [workers, setWorkers] = useState("2");
  const [hours, setHours] = useState("1");
  const [miles, setMiles] = useState("0");
  const [quote, setQuote] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const sync = () => {
      setSettings(loadPricingSettings());
      setSaved(loadSavedEstimates());
    };
    window.addEventListener("pricing-settings-updated", sync);
    return () => window.removeEventListener("pricing-settings-updated", sync);
  }, []);
  const fingerprint = JSON.stringify([
    materialId,
    vehicleId,
    facilityId,
    yards,
    weight,
    workers,
    hours,
    miles,
  ]);
  useEffect(() => {
    setQuote(null);
    setError("");
  }, [fingerprint]);
  const material = settings.materialPricingRules.find(x => x.id === materialId);
  const vehicle = settings.vehicles.find(x => x.id === vehicleId);
  const facility = settings.disposalFacilities.find(x => x.id === facilityId);
  async function calculate() {
    setBusy(true);
    setError("");
    setQuote(null);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: getStoredStaffSession()?.token,
          materialId,
          vehicleId,
          facilityId,
          cubicYards: Number(yards),
          loadFraction: vehicle ? Number(yards) / vehicle.usableCubicYards : 1,
          manualWeightLbs: weight ? Number(weight) : undefined,
          workers: Number(workers),
          estimatedHours: Number(hours),
          roundTripMiles: Number(miles),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Quote unavailable.");
      setQuote({ ...body.quote, fingerprint });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quote unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (
      !quote ||
      quote.fingerprint !== fingerprint ||
      !material ||
      !vehicle ||
      !facility
    )
      return;
    const now = new Date().toISOString();
    try {
      await saveEstimateConfirmed({
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        customerName: name,
        jobAddress: address,
        notes,
        materialType: material.materialCategory,
        materialRuleId: material.id,
        materialName: material.materialName,
        vehicleId: vehicle.id,
        vehicleName: vehicle.vehicleName,
        facilityId: facility.id,
        facilityName: facility.facilityName,
        cubicYards: quote.cubicYards,
        estimatedWeightLbs: quote.estimatedWeightLbs,
        estimatedTons: quote.estimatedTons,
        finalQuote: quote.finalRecommendedQuote,
        workers: Number(workers),
        estimatedHours: Number(hours),
        roundTripMiles: Number(miles),
        mode: "junk",
        quoteId: quote.quoteId,
      } as SavedEstimate);
      setSaved(loadSavedEstimates());
      toast.success("Estimate saved");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Estimate could not be saved."
      );
    }
  }
  const select = (
    label: string,
    value: string,
    set: (v: string) => void,
    items: { id: string; label: string }[]
  ) => (
    <label className="grid gap-2 text-sm">
      {label}
      <select
        className="h-10 rounded-md border bg-background px-3"
        value={value}
        onChange={e => set(e.target.value)}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {items.map(i => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  );
  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    type = "text"
  ) => (
    <label className="grid gap-2 text-sm">
      {label}
      <Input type={type} value={value} onChange={e => set(e.target.value)} />
    </label>
  );
  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">Estimate Builder</h1>
      <div className="flex flex-wrap gap-2">
        {[
          ["junk", "Junk removal"],
          ["service", "Assembly & services"],
          ["moving", "Moving"],
          ["vision", "Photo estimate"],
        ].map(([v, label]) => (
          <Button
            key={v}
            variant={mode === v ? "default" : "outline"}
            onClick={() => setMode(v)}
          >
            {label}
          </Button>
        ))}
      </div>
      {mode === "vision" ? (
        <VisionEstimatePanel />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Job info</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {field("Customer name", name, setName)}
              {field("Job / pickup address", address, setAddress)}
              {mode === "moving" &&
                field("Delivery address", delivery, setDelivery)}
              {field("Notes", notes, setNotes)}
            </CardContent>
          </Card>
          {mode !== "junk" ? (
            <ServiceEstimatePanel
              mode={mode as "service" | "moving"}
              customerName={name}
              jobAddress={address}
              pickupAddress={address}
              deliveryAddress={delivery}
              notes={notes}
              onSaved={() => setSaved(loadSavedEstimates())}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Junk removal quote</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  {select(
                    "Material",
                    materialId,
                    setMaterial,
                    settings.materialPricingRules
                      .filter(x => x.isActive !== false)
                      .map(x => ({ id: x.id, label: x.materialName }))
                  )}
                  {select(
                    "Vehicle",
                    vehicleId,
                    setVehicle,
                    settings.vehicles
                      .filter(x => x.isActive)
                      .map(x => ({ id: x.id, label: x.vehicleName }))
                  )}
                  {select(
                    "Facility",
                    facilityId,
                    setFacility,
                    settings.disposalFacilities
                      .filter(x => x.isActive)
                      .map(x => ({ id: x.id, label: x.facilityName }))
                  )}
                  {field("Volume (cubic yards)", yards, setYards, "number")}
                  {field(
                    "Weight override (lb, optional)",
                    weight,
                    setWeight,
                    "number"
                  )}
                  {field("Workers", workers, setWorkers, "number")}
                  {field("Estimated hours", hours, setHours, "number")}
                  {field("Round-trip miles", miles, setMiles, "number")}
                </div>
                <Button
                  disabled={
                    busy ||
                    !material ||
                    !vehicle ||
                    !facility ||
                    !address.trim() ||
                    Number(yards) <= 0
                  }
                  onClick={calculate}
                >
                  {busy ? "Calculating…" : "Calculate quote"}
                </Button>
                {error && (
                  <p role="alert" className="text-destructive">
                    {error}
                  </p>
                )}
                {quote && quote.fingerprint === fingerprint && (
                  <div className="space-y-3">
                    <p className="text-2xl font-bold">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(quote.finalRecommendedQuote)}
                    </p>
                    <p>
                      {quote.cubicYards} yd³ ·{" "}
                      {Math.round(quote.estimatedWeightLbs).toLocaleString()} lb
                    </p>
                    {quote.warnings.map((w: any) => (
                      <p key={w.code} className="text-sm">
                        {w.message}
                      </p>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={save}>Save estimate</Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              [
                                name,
                                address,
                                `Estimated price: $${quote.finalRecommendedQuote}`,
                                `Volume: ${quote.cubicYards} yd³`,
                                notes,
                              ]
                                .filter(Boolean)
                                .join("\n")
                            );
                            toast.success("Customer quote copied");
                          } catch {
                            toast.error("Could not copy the quote.");
                          }
                        }}
                      >
                        Copy customer quote
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Saved estimates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {saved.length === 0 ? (
                <p>No saved estimates.</p>
              ) : (
                saved.map(e => (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b py-3"
                  >
                    <div>
                      <p className="font-medium">
                        {e.customerName || "Unnamed customer"}
                      </p>
                      <p className="text-sm">
                        {e.jobAddress} ·{" "}
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(e.finalQuote)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const job = createJobFromEstimate(e);
                        navigate("/jobs/" + job.id);
                      }}
                    >
                      Create job
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
