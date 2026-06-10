import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, KeyRound, Loader2, LockKeyhole, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { activateWithKey, checkActivationKey } from "@/lib/driverSession";

type ActivateStep = "key" | "pin" | "location" | "done";

const KEY_LENGTH = 12;
const PIN_LENGTH = 4;

function keyFromUrl() {
  if (typeof window === "undefined") return "";
  const raw = new URLSearchParams(window.location.search).get("key") ?? "";
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, KEY_LENGTH);
}

function KeySlots() {
  return (
    <>
      <InputOTPGroup>
        {[0, 1, 2, 3].map((index) => <InputOTPSlot key={index} index={index} className="h-11 w-9 text-base font-semibold" />)}
      </InputOTPGroup>
      <InputOTPSeparator className="text-muted-foreground" />
      <InputOTPGroup>
        {[4, 5, 6, 7].map((index) => <InputOTPSlot key={index} index={index} className="h-11 w-9 text-base font-semibold" />)}
      </InputOTPGroup>
      <InputOTPSeparator className="text-muted-foreground" />
      <InputOTPGroup>
        {[8, 9, 10, 11].map((index) => <InputOTPSlot key={index} index={index} className="h-11 w-9 text-base font-semibold" />)}
      </InputOTPGroup>
    </>
  );
}

export default function DriverActivate() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<ActivateStep>("key");
  const [activationKey, setActivationKey] = useState(() => keyFromUrl());
  const [driverName, setDriverName] = useState<string | undefined>();
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationSkipped, setLocationSkipped] = useState(false);

  // The email link arrives as /driver/activate?key=XXXX-XXXX-XXXX — auto-check it.
  useEffect(() => {
    if (keyFromUrl().length === KEY_LENGTH) void submitKey(keyFromUrl());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitKey = async (key: string) => {
    setBusy(true);
    setError(null);
    try {
      setDriverName(await checkActivationKey(key));
      setActivationKey(key);
      setStep("pin");
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async (confirmedPin: string) => {
    if (confirmedPin !== pin) {
      setError("Those PINs don't match. Let's try again.");
      setPin("");
      setPinConfirm("");
      setConfirming(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await activateWithKey(activationKey, pin);
      setStep("location");
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Something went wrong. Try again.");
      setPin("");
      setPinConfirm("");
      setConfirming(false);
      if (activateError instanceof Error && /key/i.test(activateError.message)) setStep("key");
    } finally {
      setBusy(false);
    }
  };

  const requestLocation = () => {
    setBusy(true);
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationSkipped(true);
      setStep("done");
      setBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setBusy(false);
        setStep("done");
      },
      () => {
        setBusy(false);
        setLocationSkipped(true);
        setStep("done");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="border-b border-[var(--pine-line)] bg-[#052a2b] px-4 py-4">
        <div className="mx-auto flex max-w-md items-center justify-center">
          <img src="/rejunk.png" alt="Rejunk" className="h-12 w-auto" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-8">
        {step === "key" && (
          <section className="space-y-5 rounded-lg border border-border bg-background p-6 shadow-sm">
            <div className="space-y-2 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#155e3f]/10 text-[#155e3f]">
                <KeyRound className="size-6" />
              </span>
              <h1 className="text-xl font-bold">Enter your activation key</h1>
              <p className="text-sm text-muted-foreground">It's in the email from your dispatcher — 12 letters and numbers.</p>
            </div>
            <div className="flex justify-center">
              <InputOTP
                maxLength={KEY_LENGTH}
                value={activationKey}
                onChange={(value) => setActivationKey(value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                inputMode="text"
                autoFocus
                disabled={busy}
                containerClassName="flex-wrap justify-center gap-1.5"
              >
                <KeySlots />
              </InputOTP>
            </div>
            {error && <p className="text-center text-sm font-medium text-destructive">{error}</p>}
            <Button
              className="h-12 w-full bg-[#155e3f] text-white hover:bg-[#0c4a30]"
              disabled={activationKey.length !== KEY_LENGTH || busy}
              onClick={() => void submitKey(activationKey)}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Continue
            </Button>
          </section>
        )}

        {step === "pin" && (
          <section className="space-y-5 rounded-lg border border-border bg-background p-6 shadow-sm">
            <div className="space-y-2 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#155e3f]/10 text-[#155e3f]">
                <LockKeyhole className="size-6" />
              </span>
              <h1 className="text-xl font-bold">{confirming ? "Confirm your PIN" : "Set your PIN"}</h1>
              <p className="text-sm text-muted-foreground">
                {driverName ? `Welcome, ${driverName.split(" ")[0]}! ` : ""}
                {confirming ? "Type the same 4 digits one more time." : "Pick 4 digits you'll use to sign in each day."}
              </p>
            </div>
            <div className="flex justify-center">
              <InputOTP
                key={confirming ? "confirm" : "set"}
                maxLength={PIN_LENGTH}
                value={confirming ? pinConfirm : pin}
                onChange={(value) => {
                  const digits = value.replace(/\D/g, "");
                  setError(null);
                  if (confirming) {
                    setPinConfirm(digits);
                    if (digits.length === PIN_LENGTH) void submitPin(digits);
                  } else {
                    setPin(digits);
                    if (digits.length === PIN_LENGTH) setConfirming(true);
                  }
                }}
                inputMode="numeric"
                autoFocus
                disabled={busy}
                containerClassName="justify-center"
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3].map((index) => <InputOTPSlot key={index} index={index} className="size-14 text-2xl font-bold" />)}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {busy && <p className="text-center text-sm text-muted-foreground">Activating...</p>}
            {error && <p className="text-center text-sm font-medium text-destructive">{error}</p>}
            {confirming && !busy && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setPin("");
                  setPinConfirm("");
                  setConfirming(false);
                  setError(null);
                }}
              >
                Start over with a different PIN
              </Button>
            )}
          </section>
        )}

        {step === "location" && (
          <section className="space-y-5 rounded-lg border border-border bg-background p-6 shadow-sm">
            <div className="space-y-2 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#155e3f]/10 text-[#155e3f]">
                <MapPin className="size-6" />
              </span>
              <h1 className="text-xl font-bold">Allow location access</h1>
              <p className="text-sm text-muted-foreground">
                Your dispatcher needs to see where you are to assign jobs efficiently. Location is only shared while the app is open.
              </p>
            </div>
            {error && <p className="text-center text-sm font-medium text-destructive">{error}</p>}
            <Button className="h-12 w-full bg-[#155e3f] text-white hover:bg-[#0c4a30]" disabled={busy} onClick={requestLocation}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
              Allow location access
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setLocationSkipped(true);
                setStep("done");
              }}
            >
              Skip for now
            </button>
            <p className="text-center text-xs text-muted-foreground">
              If you skip, your dispatcher won't see you on the live map and map features won't work.
            </p>
          </section>
        )}

        {step === "done" && (
          <section className="space-y-5 rounded-lg border border-border bg-background p-6 text-center shadow-sm">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-green-100 text-green-700">
              <CheckCircle2 className="size-7" />
            </span>
            <div className="space-y-2">
              <h1 className="text-xl font-bold">You're activated!</h1>
              <p className="text-sm text-muted-foreground">Your dispatcher can now send you jobs.</p>
              {locationSkipped && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Location is off, so you won't show on the dispatch map. You can allow it later in your phone's browser settings.
                </p>
              )}
            </div>
            <Button className="h-12 w-full bg-[#155e3f] text-white hover:bg-[#0c4a30]" onClick={() => navigate("/driver")}>
              Go to My Jobs
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
