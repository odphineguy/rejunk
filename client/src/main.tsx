import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Render immediately — the public landing page must not wait on (or even
// download) the Supabase-backed cache hydration. That kickoff now lives in
// lib/appHydration.ts and runs when the staff or driver bundle loads.
createRoot(document.getElementById("root")!).render(<App />);
