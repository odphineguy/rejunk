import { useEffect, useState } from "react";

import {
  getStoredStaffSession,
  STAFF_SESSION_EVENT,
  type StoredStaffSession,
} from "@/lib/staffSession";

/**
 * Reactive view of the signed-in office staffer. Re-reads on login/logout and
 * when validateStoredStaffSession refreshes the cached role. Used to gate
 * owner-only UI (pricing, payments, profit) from Office Staff.
 */
export function useStaffSession(): {
  session: StoredStaffSession | null;
  isOwner: boolean;
} {
  const [session, setSession] = useState<StoredStaffSession | null>(() =>
    getStoredStaffSession()
  );

  useEffect(() => {
    const refresh = () => setSession(getStoredStaffSession());
    window.addEventListener(STAFF_SESSION_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(STAFF_SESSION_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return { session, isOwner: session?.role === "owner" };
}
