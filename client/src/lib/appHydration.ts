/**
 * Startup hydration for the Supabase-backed caches, shared by the staff and
 * driver bundles. This used to live in main.tsx, but the public landing page
 * must not pull in Supabase — so the kickoff now happens when one of the two
 * internal bundles loads (module scope, so it starts with the chunk download).
 *
 * Same contract as before: wait for hydration OR the 2.5s timeout, whichever
 * comes first, so a slow/unreachable backend can't block the UI — pages mount
 * from the localStorage warm cache and background hydration dispatches the
 * `*-updated` events when it lands.
 */

import { hydrateClients } from "@/lib/clientStorage";
import { hydrateJobs } from "@/lib/jobStorage";
import { hydrateThumbtackLeads } from "@/lib/leadsStorage";
import { hydratePricebook } from "@/lib/pricebookStorage";
import { hydrateSettings } from "@/lib/settingsStorage";
import { hydratePricingData } from "@/utils/pricingStorage";

const HYDRATE_TIMEOUT_MS = 2500;

import { ensureSession, isDriverDatabaseContext } from "@/lib/supabase";

async function hydrateOffice() {
  if (isDriverDatabaseContext() || !(await ensureSession())) return;
  await Promise.all([
    hydratePricingData(),
    hydrateJobs(),
    hydratePricebook(),
    hydrateClients(),
    hydrateSettings(),
    hydrateThumbtackLeads(),
  ]);
}
const hydration = hydrateOffice();
function currentLoginToken(): string | null {
  try {
    return (
      JSON.parse(localStorage.getItem("rejunk_staff_session") ?? "null")
        ?.token ?? null
    );
  } catch {
    return null;
  }
}
let lastLogin = currentLoginToken();
window.addEventListener("staff-session-updated", () => {
  const next = currentLoginToken();
  const changed = next !== lastLogin;
  lastLogin = next;
  if (next && changed) void hydrateOffice().catch(console.error);
});

const timeout = new Promise<void>(resolve =>
  setTimeout(resolve, HYDRATE_TIMEOUT_MS)
);

export const appDataReady: Promise<void> = Promise.race([
  hydration,
  timeout,
]).catch(() => undefined);
