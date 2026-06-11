import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

import {
  getStoredStaffSession,
  validateStoredStaffSession,
  STAFF_SESSION_EVENT,
} from "@/lib/staffSession";

// Where StaffLogin sends the user after a successful sign-in.
const NEXT_PATH_KEY = "rejunk_staff_next";

export function rememberRequestedPath(path: string) {
  try {
    window.sessionStorage.setItem(NEXT_PATH_KEY, path);
  } catch {
    /* private-mode quota — login just falls back to /dashboard */
  }
}

export function consumeRequestedPath(): string | null {
  try {
    const path = window.sessionStorage.getItem(NEXT_PATH_KEY);
    window.sessionStorage.removeItem(NEXT_PATH_KEY);
    return path;
  } catch {
    return null;
  }
}

/**
 * Wraps every internal office route. No stored session -> straight to /login
 * (remembering where the user was headed). A stored session renders
 * immediately while it is re-checked against the staff table in the
 * background; a deactivated account gets bounced to the login screen.
 * Mirrors DriverSessionGate — staff and driver sessions are independent.
 */
export function StaffSessionGate({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [hasSession, setHasSession] = useState(() => Boolean(getStoredStaffSession()));

  useEffect(() => {
    if (!getStoredStaffSession()) {
      rememberRequestedPath(location);
      navigate("/login", { replace: true });
      return;
    }
    let cancelled = false;
    void validateStoredStaffSession().then((result) => {
      if (cancelled) return;
      if (result === "invalid" || result === "missing") {
        setHasSession(false);
        navigate("/login", { replace: true });
      }
    });
    const onSessionChange = () => {
      if (!getStoredStaffSession()) {
        setHasSession(false);
        navigate("/login", { replace: true });
      }
    };
    window.addEventListener(STAFF_SESSION_EVENT, onSessionChange);
    return () => {
      cancelled = true;
      window.removeEventListener(STAFF_SESSION_EVENT, onSessionChange);
    };
    // location is intentionally read only on first mount for the remembered path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
