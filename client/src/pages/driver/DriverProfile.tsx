import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, LogOut, MapPin, Truck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { DriverBottomNav } from "@/components/DriverBottomNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isLocationReporting, stopLocationReporting } from "@/lib/driverLocation";
import { clearDriverSession, updateDriverPin } from "@/lib/driverSession";
import { loadDriverToday } from "@/lib/driverStorage";
import type { DriverTodayData } from "@/types/driver";

const APP_VERSION = "1.0.0";

function syncLabel(value?: string) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function DriverProfile() {
  const [, navigate] = useLocation();
  const [today, setToday] = useState<DriverTodayData | null>(null);
  const [locationActive, setLocationActive] = useState(() => isLocationReporting());
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    void loadDriverToday().then(setToday);
    const updateLocation = () => setLocationActive(isLocationReporting());
    window.addEventListener("driver-location-reporting-changed", updateLocation);
    return () => window.removeEventListener("driver-location-reporting-changed", updateLocation);
  }, []);

  const driver = today?.driver;
  const vehicleName = today?.activeJob?.vehicleName ?? today?.upcomingJobs[0]?.vehicleName;

  const submitPinChange = async () => {
    if (newPin !== confirmPin) {
      toast.error("The new PINs don't match.");
      return;
    }
    setSavingPin(true);
    try {
      await updateDriverPin(currentPin, newPin);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      toast.success("PIN updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PIN update failed");
    } finally {
      setSavingPin(false);
    }
  };

  const signOut = () => {
    stopLocationReporting();
    clearDriverSession();
    navigate("/driver/login", { replace: true });
  };

  const pinInputProps = {
    type: "password" as const,
    inputMode: "numeric" as const,
    pattern: "[0-9]*",
    maxLength: 4,
    autoComplete: "off" as const,
    placeholder: "••••",
  };

  return (
    <div className="min-h-dvh bg-muted/30 pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-[2.25rem_1fr_2.25rem] items-center">
          <span />
          <img src="/rejunk-logo.svg" alt="Rejunk" className="mx-auto h-20 w-auto max-w-[280px]" />
          <span />
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4" />Personal Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0 text-sm">
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Name</span><span className="font-medium">{driver?.displayName || "Driver"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Email</span><span className="font-medium">{driver?.email || "—"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Phone</span><span className="font-medium">{driver?.phone || "—"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Role</span><span className="font-medium capitalize">{driver?.role || "driver"}</span></div>
            <p className="pt-1 text-xs text-muted-foreground">Dispatch manages this info. Ask them to fix anything that's wrong.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" />Change PIN</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="space-y-1.5">
              <Label htmlFor="current-pin">Current PIN</Label>
              <Input id="current-pin" {...pinInputProps} value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pin">New PIN (4 digits)</Label>
              <Input id="new-pin" {...pinInputProps} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pin">Confirm new PIN</Label>
              <Input id="confirm-pin" {...pinInputProps} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ""))} />
            </div>
            <Button
              className="h-12 w-full"
              disabled={savingPin || currentPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4}
              onClick={() => void submitPinChange()}
            >
              {savingPin ? "Updating..." : "Update PIN"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Truck className="size-4" />Current Vehicle</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-sm">
            <div className="font-medium">{vehicleName || "No vehicle assigned today"}</div>
            <p className="mt-1 text-xs text-muted-foreground">Dispatch assigns vehicles.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">App Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0 text-sm">
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">App version</span><span className="font-medium">{APP_VERSION}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Last sync</span><span className="font-medium">{syncLabel(today?.lastSyncedAt)}</span></div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Location sharing</span>
              {locationActive ? (
                <Badge variant="outline" className="gap-1 border-green-200 bg-green-50 text-green-700"><MapPin className="size-3" />Active</Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-gray-200 bg-gray-50 text-gray-600"><MapPin className="size-3" />Off</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Button variant="destructive" className="h-12 w-full" onClick={signOut}>
          <LogOut className="size-4" />
          Sign Out
        </Button>
      </main>

      <DriverBottomNav active="profile" />
    </div>
  );
}
