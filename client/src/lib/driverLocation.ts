/**
 * Continuous GPS reporting from the driver app.
 *
 * `watchPosition` keeps the freshest fix in memory; every 30 seconds (while the
 * tab is in the foreground) the latest fix is pushed to Supabase: one insert
 * into driver_location_history plus an update of the live driver_sessions row
 * that the dispatch map subscribes to. Writes are fire-and-forget, matching the
 * rest of the app. Location is only collected while the Rejunk tab is active.
 */

import { getStoredDriverSession } from "@/lib/driverSession";
import { ensureSession, supabase } from "@/lib/supabase";

const REPORT_INTERVAL_MS = 30_000;
// Don't report a fix older than this — the driver may have GPS blocked indoors.
const STALE_FIX_MS = 60_000;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

type LatestFix = {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  capturedAt: number;
};

let watchId: number | null = null;
let intervalId: number | null = null;
let latestFix: LatestFix | null = null;
let accessToken: string | null = null;
let unloadHandlersBound = false;

export function isLocationReporting() {
  return watchId !== null;
}

export type LocationPermission = "granted" | "denied" | "prompt" | "unknown";

export async function getLocationPermissionState(): Promise<LocationPermission> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unknown";
  }
}

/**
 * Starts GPS reporting for the signed-in driver. Resolves `true` when the
 * watch is running. Safe to call repeatedly (e.g. on every DriverHome mount).
 */
export async function startLocationReporting(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return false;
  const session = getStoredDriverSession();
  if (!session || !supabase) return false;
  if (watchId !== null) return true;
  if (!(await ensureSession())) return false;

  // Cached for the keepalive "going offline" request, which can't await.
  const auth = await supabase.auth.getSession();
  accessToken = auth.data.session?.access_token ?? null;

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      latestFix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
        speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        capturedAt: Date.now(),
      };
    },
    (error) => {
      console.warn("[driver-location] watchPosition error:", error.message);
      if (error.code === error.PERMISSION_DENIED) stopLocationReporting();
    },
    { enableHighAccuracy: true, maximumAge: 10_000 },
  );

  intervalId = window.setInterval(() => void reportLatestFix(), REPORT_INTERVAL_MS);
  bindUnloadHandlers();
  window.dispatchEvent(new Event("driver-location-reporting-changed"));

  // First fix can take a few seconds; report it as soon as it lands.
  void waitForFirstFix().then(() => void reportLatestFix());
  return true;
}

export function stopLocationReporting() {
  if (typeof navigator !== "undefined" && watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (intervalId !== null) window.clearInterval(intervalId);
  watchId = null;
  intervalId = null;
  latestFix = null;
  window.dispatchEvent(new Event("driver-location-reporting-changed"));
}

async function waitForFirstFix() {
  for (let waited = 0; waited < 15_000 && !latestFix; waited += 500) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function reportLatestFix() {
  const session = getStoredDriverSession();
  if (!session || !supabase || !latestFix) return;
  if (Date.now() - latestFix.capturedAt > STALE_FIX_MS) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

  const now = new Date().toISOString();
  const fix = latestFix;
  try {
    await Promise.all([
      supabase.from("driver_location_history").insert({
        employee_id: session.employeeId,
        session_id: session.sessionId,
        lat: fix.lat,
        lng: fix.lng,
        heading: fix.heading,
        speed: fix.speed,
        accuracy: fix.accuracy,
        recorded_at: now,
      }),
      supabase
        .from("driver_sessions")
        .update({
          last_lat: fix.lat,
          last_lng: fix.lng,
          last_heading: fix.heading,
          last_seen_at: now,
          is_online: true,
        })
        .eq("id", session.sessionId),
    ]);
  } catch (error) {
    console.warn("[driver-location] report failed:", error);
  }
}

function bindUnloadHandlers() {
  if (unloadHandlersBound || typeof window === "undefined") return;
  unloadHandlersBound = true;
  const goOffline = () => markOfflineKeepalive();
  window.addEventListener("beforeunload", goOffline);
  window.addEventListener("pagehide", goOffline);
}

/**
 * Best-effort "I'm going offline" on tab close. supabase-js can't issue
 * keepalive requests from an unload handler, so this hits PostgREST directly.
 * Dispatch also treats >5 min of silence as offline, so a miss here is OK.
 */
function markOfflineKeepalive() {
  const session = getStoredDriverSession();
  if (!session || !SUPABASE_URL || !SUPABASE_ANON_KEY || !accessToken || watchId === null) return;
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/driver_sessions?id=eq.${encodeURIComponent(session.sessionId)}`, {
      method: "PATCH",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ is_online: false }),
    });
  } catch {
    // Tab is closing; nothing else to do.
  }
}
