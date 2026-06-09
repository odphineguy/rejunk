import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

import { getStoredDriverSession, validateStoredSession } from "@/lib/driverSession";

/**
 * Wraps every working driver route (/driver, /driver/jobs/:id, ...). No stored
 * session -> straight to /driver/login. A stored session renders immediately
 * (so a driver with a flaky signal isn't blocked in the field) while the token
 * is re-checked against driver_sessions in the background; if dispatch revoked
 * it, the driver is bounced to the login screen.
 */
export function DriverSessionGate({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const [hasSession, setHasSession] = useState(() => Boolean(getStoredDriverSession()));

  useEffect(() => {
    if (!getStoredDriverSession()) {
      navigate("/driver/login", { replace: true });
      return;
    }
    let cancelled = false;
    void validateStoredSession().then((result) => {
      if (cancelled) return;
      if (result === "invalid" || result === "missing") {
        setHasSession(false);
        navigate("/driver/login", { replace: true });
      }
    });
    const onSessionChange = () => {
      if (!getStoredDriverSession()) {
        setHasSession(false);
        navigate("/driver/login", { replace: true });
      }
    };
    window.addEventListener("driver-session-updated", onSessionChange);
    return () => {
      cancelled = true;
      window.removeEventListener("driver-session-updated", onSessionChange);
    };
  }, [navigate]);

  if (!hasSession) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Checking your session...
      </div>
    );
  }
  return <>{children}</>;
}
