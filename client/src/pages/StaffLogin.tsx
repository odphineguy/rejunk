import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { consumeRequestedPath } from "@/components/StaffSessionGate";
import { getOfficeAccount } from "@/lib/supabase";
import {
  clearStaffSession,
  confirmEmailCode,
  EmailRequiredError,
  getStoredStaffSession,
  loginWithPin,
  pinLockoutRemainingMs,
  requestEmailCode,
  validateStoredStaffSession,
} from "@/lib/staffSession";

const PIN_LENGTH = 4;

type Step = "email" | "code" | "pin";

/**
 * The office "front door". A new device proves the email with a one-time code,
 * then asks for the 4-digit PIN; a device already signed in to the email
 * account goes straight to the PIN.
 */
export default function StaffLogin() {
  const [, navigate] = useLocation();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutMs, setLockoutMs] = useState(() => pinLockoutRemainingMs());

  const goInside = () => navigate(consumeRequestedPath() ?? "/dashboard", { replace: true });

  // A still-valid stored session skips the form entirely; a device already
  // signed in to the email account only needs the PIN.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (getStoredStaffSession()) {
        const result = await validateStoredStaffSession();
        if (cancelled) return;
        if (result === "valid" || result === "offline") return goInside();
      }
      const account = await getOfficeAccount();
      if (cancelled) return;
      if (account) {
        setEmail(account.email);
        setStep("pin");
      }
      setChecking(false);
    })();
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

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (stepError) {
      setError(stepError instanceof Error ? stepError.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      if (!email.trim()) throw new Error("Enter your email first.");
      await requestEmailCode(email);
      setCode("");
      setStep("code");
    });

  const submitCode = () =>
    run(async () => {
      await confirmEmailCode(email, code.trim());
      setStep("pin");
    });

  const useDifferentEmail = () => {
    clearStaffSession({ forgetDevice: true });
    setEmail("");
    setCode("");
    setPin("");
    setError(null);
    setStep("email");
  };

  const submitPin = (pinValue: string) =>
    run(async () => {
      try {
        await loginWithPin(pinValue);
        goInside();
      } catch (loginError) {
        setPin("");
        setLockoutMs(pinLockoutRemainingMs());
        if (loginError instanceof EmailRequiredError) {
          clearStaffSession({ forgetDevice: true });
          setStep("email");
        }
        throw loginError;
      }
    });

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
            <p className="text-sm text-muted-foreground">
              {step === "email" && "Enter your email. We'll send you a sign-in code."}
              {step === "code" && `We emailed a code to ${email.trim()}. Enter it below.`}
              {step === "pin" && `Signed in as ${email}. Enter your 4-digit PIN.`}
            </p>
          </div>

          {step === "email" && (
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
                disabled={busy}
                onChange={(event) => {
                  setError(null);
                  setEmail(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && email.trim()) void sendCode();
                }}
                className="h-12 border-[#155e3f]/40 bg-white"
              />
            </div>
          )}

          {step === "code" && (
            <div className="space-y-2">
              <label htmlFor="staff-code" className="text-sm font-medium">
                Code from the email
              </label>
              <Input
                id="staff-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={8}
                placeholder="123456"
                value={code}
                autoFocus
                disabled={busy}
                onChange={(event) => {
                  setError(null);
                  setCode(event.target.value.replace(/\D/g, ""));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && code.length >= 6) void submitCode();
                }}
                className="h-12 border-[#155e3f]/40 bg-white text-center text-xl font-bold tracking-[0.3em]"
              />
            </div>
          )}

          {step === "pin" && (
            <div className="space-y-2">
              <span className="block text-center text-sm font-medium">PIN</span>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={PIN_LENGTH}
                  value={pin}
                  autoFocus
                  onChange={(value) => {
                    const digits = value.replace(/\D/g, "");
                    setError(null);
                    setPin(digits);
                    if (digits.length === PIN_LENGTH && !lockedOut) void submitPin(digits);
                  }}
                  inputMode="numeric"
                  disabled={busy || lockedOut}
                  containerClassName="justify-center"
                >
                  {/* The default slot border (border-input) disappears on the cream
                      background — pine borders + white fill so the boxes read as inputs. */}
                  <InputOTPGroup>
                    {[0, 1, 2, 3].map((index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        className="size-14 border-y-2 border-r-2 border-[#155e3f]/50 bg-white text-2xl font-bold first:border-l-2 data-[active=true]:border-[#155e3f] data-[active=true]:ring-[#155e3f]/30"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
          )}

          {busy && <p className="text-center text-sm text-muted-foreground">One moment...</p>}
          {step === "pin" && lockedOut && (
            <p className="text-center text-sm font-medium text-destructive">
              Too many tries. Wait {lockoutMinutes} {lockoutMinutes === 1 ? "minute" : "minutes"}, then try again.
            </p>
          )}
          {!(step === "pin" && lockedOut) && error && (
            <p className="text-center text-sm font-medium text-destructive">{error}</p>
          )}

          <Button
            className="h-12 w-full bg-[#155e3f] text-base font-bold text-white hover:bg-[#0c4a30] disabled:opacity-100 disabled:bg-[#155e3f]/30 disabled:text-[#052a2b]/60"
            disabled={
              busy ||
              (step === "email" && !email.trim()) ||
              (step === "code" && code.length < 6) ||
              (step === "pin" && (lockedOut || pin.length !== PIN_LENGTH))
            }
            onClick={() => {
              if (step === "email") void sendCode();
              else if (step === "code") void submitCode();
              else void submitPin(pin);
            }}
          >
            {step === "email" ? "Email me a code" : step === "code" ? "Continue" : "Sign in"}
          </Button>

          {step !== "email" && (
            <div className="flex justify-center gap-4 text-sm">
              {step === "code" && (
                <button type="button" className="text-[#155e3f] underline" disabled={busy} onClick={() => void sendCode()}>
                  Send a new code
                </button>
              )}
              <button type="button" className="text-[#155e3f] underline" disabled={busy} onClick={useDifferentEmail}>
                Use a different email
              </button>
            </div>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Forgot your PIN? Ask the owner to reset it.
          </p>
        </section>
      </main>
    </div>
  );
}
