import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { consumeRequestedPath } from "@/components/StaffSessionGate";
import {
  getStoredStaffSession,
  loginWithEmailPin,
  pinLockoutRemainingMs,
  validateStoredStaffSession,
} from "@/lib/staffSession";

const PIN_LENGTH = 4;

/** The office "front door": email + 4-digit PIN, mirroring the driver login UX. */
export default function StaffLogin() {
  const [, navigate] = useLocation();
  const [checking, setChecking] = useState(() => Boolean(getStoredStaffSession()));
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutMs, setLockoutMs] = useState(() => pinLockoutRemainingMs());

  const goInside = () => navigate(consumeRequestedPath() ?? "/dashboard", { replace: true });

  // A still-valid stored session skips the form entirely.
  useEffect(() => {
    if (!getStoredStaffSession()) return;
    let cancelled = false;
    void validateStoredStaffSession().then((result) => {
      if (cancelled) return;
      if (result === "valid" || result === "offline") goInside();
      else setChecking(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lockoutMs <= 0) return;
    const timer = window.setInterval(() => setLockoutMs(pinLockoutRemainingMs()), 1000);
    return () => window.clearInterval(timer);
  }, [lockoutMs]);

  const submit = async (pinValue: string) => {
    if (!email.trim()) {
      setError("Enter your email first.");
      setPin("");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await loginWithEmailPin(email, pinValue);
      goInside();
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
            <h1 className="text-xl font-bold">Staff sign in</h1>
            <p className="text-sm text-muted-foreground">Enter your email and 4-digit PIN.</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="staff-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="staff-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              autoFocus
              disabled={busy || lockedOut}
              onChange={(event) => {
                setError(null);
                setEmail(event.target.value);
              }}
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <span className="block text-center text-sm font-medium">PIN</span>
            <div className="flex justify-center">
              <InputOTP
                maxLength={PIN_LENGTH}
                value={pin}
                onChange={(value) => {
                  const digits = value.replace(/\D/g, "");
                  setError(null);
                  setPin(digits);
                  if (digits.length === PIN_LENGTH && !lockedOut) void submit(digits);
                }}
                inputMode="numeric"
                disabled={busy || lockedOut}
                containerClassName="justify-center"
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3].map((index) => (
                    <InputOTPSlot key={index} index={index} className="size-14 text-2xl font-bold" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          {busy && <p className="text-center text-sm text-muted-foreground">Signing in...</p>}
          {lockedOut && (
            <p className="text-center text-sm font-medium text-destructive">
              Too many tries. Wait {lockoutMinutes} {lockoutMinutes === 1 ? "minute" : "minutes"}, then try again.
            </p>
          )}
          {!lockedOut && error && <p className="text-center text-sm font-medium text-destructive">{error}</p>}

          <Button
            className="h-12 w-full bg-[#155e3f] text-white hover:bg-[#0c4a30]"
            disabled={busy || lockedOut || pin.length !== PIN_LENGTH}
            onClick={() => void submit(pin)}
          >
            Sign in
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Forgot your PIN? Ask the owner to reset it.
          </p>
        </section>
      </main>
    </div>
  );
}
