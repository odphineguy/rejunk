/** These are disposable server-backed caches, not the local-only invoice ledger. */
const keys = [
  "junk_estimator_jobs_v1",
  "junk_estimator_saved_estimates_v1",
  "junk_estimator_pricing_settings_v1",
  "junk_estimator_pricebook_v2",
  "junk_estimator_thumbtack_leads_v1",
];
export function clearFinancialCaches() {
  if (typeof window === "undefined") return;
  for (const key of keys) localStorage.removeItem(key);
  for (const key of Object.keys(localStorage))
    if (key.startsWith("rejunk-settings-")) localStorage.removeItem(key);
  window.dispatchEvent(new Event("business-cache-reset"));
}

export function currentStaffIdentity(): string | null {
  return typeof localStorage === "undefined"
    ? null
    : localStorage.getItem("rejunk_staff_session");
}

if (typeof window !== "undefined")
  window.addEventListener("storage", event => {
    if (event.key === "rejunk_staff_session") {
      clearFinancialCaches();
      window.dispatchEvent(new Event("staff-session-updated"));
    }
  });
