import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { hydratePricingData } from "@/utils/pricingStorage";

const root = createRoot(document.getElementById("root")!);

// Hydrate pricing data from Supabase before first render so pages mount with
// fresh data. Cap the wait so a slow/unreachable backend can't block the UI —
// the app falls back to the localStorage cache and hydration finishes in the
// background (it dispatches `pricing-settings-updated` when it lands).
const HYDRATE_TIMEOUT_MS = 2500;
const hydration = hydratePricingData();
const timeout = new Promise<void>((resolve) => setTimeout(resolve, HYDRATE_TIMEOUT_MS));

void Promise.race([hydration, timeout]).finally(() => {
  root.render(<App />);
});
