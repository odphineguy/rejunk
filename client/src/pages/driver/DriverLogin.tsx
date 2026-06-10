import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { getDriverIdentity, loginWithPin, pinLockoutRemainingMs, validateStoredSession } from "@/lib/driverSession";

const PIN_LENGTH = 4;

export default function DriverLogin() {
  const [, navigate] = useLocation();
  const [checking, setChecking] = useState(true);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutMs, setLockoutMs] = useState(() => pinLockoutRemainingMs());
  const identity = getDriverIdentity();

  // A still-valid stored session skips the PIN entirely.
  useEffect(() => {
    let cancelled = false;
    void validateStoredSession().then((result) => {
      if (cancelled) return;
      if (result === "valid" || result === "offline") navigate("/driver");
      else setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (lockoutMs <= 0) return;
    const timer = window.setInterval(() => setLockoutMs(pinLockoutRemainingMs()), 1000);
    return () => window.clearInterval(timer);
  }, [lockoutMs]);

  const submitPin = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await loginWithPin(value);
      navigate("/driver");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Something went wrong. Try again.");
      setPin("");
      setLockoutMs(pinLockoutRemainingMs());
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Checking your session...
      </div>
    );
  }

  const lockedOut = lockoutMs > 0;
  const lockoutMinutes = Math.ceil(lockoutMs / 60000);

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="border-b border-[var(--pine-line)] bg-[#052a2b] px-4 py-4">
        <div className="mx-auto flex max-w-md items-center justify-center">
          <img src="/rejunk-mark.png" alt="Rejunk" className="h-8 w-auto" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-8">
        <section className="space-y-5 rounded-lg border border-border bg-background p-6 shadow-sm">
          <div className="space-y-2 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#155e3f]/10 text-[#155e3f]">
              <LockKeyhole className="size-6" />
            </span>
            <h1 className="text-xl font-bold">
              {identity?.displayName ? `Welcome back, ${identity.displayName.split(" ")[0]}` : "Driver sign in"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {identity
                ? "Enter your 4-digit PIN."
                : "This phone hasn't been activated. Open the activation link your dispatcher emailed you."}
            </p>
          </div>

          {identity && (
            <>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={PIN_LENGTH}
                  value={pin}
                  onChange={(value) => {
                    const digits = value.replace(/\D/g, "");
                    setError(null);
                    setPin(digits);
                    if (digits.length === PIN_LENGTH && !lockedOut) void submitPin(digits);
                  }}
                  inputMode="numeric"
                  autoFocus
                  disabled={busy || lockedOut}
                  containerClassName="justify-center"
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3].map((index) => <InputOTPSlot key={index} index={index} className="size-14 text-2xl font-bold" />)}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {busy && <p className="text-center text-sm text-muted-foreground">Signing in...</p>}
              {lockedOut && (
                <p className="text-center text-sm font-medium text-destructive">
                  Too many tries. Wait {lockoutMinutes} {lockoutMinutes === 1 ? "minute" : "minutes"}, then try again.
                </p>
              )}
              {!lockedOut && error && <p className="text-center text-sm font-medium text-destructive">{error}</p>}
            </>
          )}

          {!identity && (
            <Button className="h-12 w-full bg-[#155e3f] text-white hover:bg-[#0c4a30]" onClick={() => navigate("/driver/activate")}>
              I have an activation key
            </Button>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Forgot your PIN? Contact your dispatcher to resend your activation.
          </p>
        </section>
      </main>
    </div>
  );
}
