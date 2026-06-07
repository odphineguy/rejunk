import type { DriverJob, JobStop } from "@/types/driver";
import type { Job } from "@/types/jobs";
import { customerStops } from "@/lib/operationalMetrics";

export type LocationUnavailableReason =
  | "not_attempted"
  | "missing_street"
  | "missing_city"
  | "missing_state"
  | "missing_zip"
  | "incomplete_address"
  | "geocode_no_results"
  | "geocode_denied"
  | "geocode_rate_limited"
  | "geocode_failed"
  | "coordinates_invalid";

export type LocationStatus = {
  address: string;
  primaryStop?: JobStop;
  coords?: google.maps.LatLngLiteral;
  reason?: LocationUnavailableReason;
  message?: string;
  cacheKey: string;
};

export type CachedLocation = {
  coords?: google.maps.LatLngLiteral;
  reason?: LocationUnavailableReason;
  address: string;
  updatedAt: string;
  pendingSync?: boolean;
};

export const COORD_CACHE_KEY = "rejunk_dispatch_geocode_cache_v2";

export function readLocationCache() {
  try {
    return JSON.parse(window.localStorage.getItem(COORD_CACHE_KEY) || "{}") as Record<string, CachedLocation>;
  } catch {
    return {};
  }
}

export function writeLocationCache(cache: Record<string, CachedLocation>) {
  window.localStorage.setItem(COORD_CACHE_KEY, JSON.stringify(cache));
}

export function coordinateValid(coords?: google.maps.LatLngLiteral | null) {
  return Boolean(coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) && Math.abs(coords.lat) <= 90 && Math.abs(coords.lng) <= 180);
}

export function geocodeStatusToReason(status: string): LocationUnavailableReason {
  if (status === "ZERO_RESULTS") return "geocode_no_results";
  if (status === "REQUEST_DENIED") return "geocode_denied";
  if (status === "OVER_QUERY_LIMIT") return "geocode_rate_limited";
  if (status === "INVALID_REQUEST") return "incomplete_address";
  return "geocode_failed";
}

export function reasonLabel(reason?: LocationUnavailableReason) {
  switch (reason) {
    case "missing_street":
      return "Missing street";
    case "missing_city":
      return "Missing city";
    case "missing_state":
      return "Missing state";
    case "missing_zip":
      return "Missing ZIP";
    case "incomplete_address":
      return "Incomplete address";
    case "geocode_no_results":
      return "No geocode result";
    case "geocode_denied":
      return "Geocode denied";
    case "geocode_rate_limited":
      return "Rate limited";
    case "geocode_failed":
      return "Geocode failed";
    case "coordinates_invalid":
      return "Invalid coordinates";
    case "not_attempted":
    default:
      return "Not geocoded yet";
  }
}

function addressParts(job: Job, driverJob: DriverJob) {
  const primaryStop = customerStops(driverJob.stops)[0];
  return {
    primaryStop,
    street: primaryStop?.address ?? job.address ?? "",
    city: primaryStop?.city ?? job.city ?? "",
    state: primaryStop?.state ?? job.state ?? "",
    zip: primaryStop?.zip ?? job.zip ?? "",
  };
}

export function primaryServiceLocationStatus(job: Job, driverJob: DriverJob, cache = readLocationCache()): LocationStatus {
  const parts = addressParts(job, driverJob);
  const address = [parts.street, parts.city, parts.state, parts.zip].filter(Boolean).join(", ");
  const stopCoords =
    parts.primaryStop?.latitude != null && parts.primaryStop?.longitude != null
      ? { lat: parts.primaryStop.latitude, lng: parts.primaryStop.longitude }
      : undefined;
  if (coordinateValid(stopCoords)) return { address, primaryStop: parts.primaryStop, coords: stopCoords, cacheKey: address };

  const jobCoords = (job as Job & { latitude?: number; longitude?: number }).latitude != null && (job as Job & { latitude?: number; longitude?: number }).longitude != null
    ? { lat: (job as Job & { latitude?: number; longitude?: number }).latitude!, lng: (job as Job & { latitude?: number; longitude?: number }).longitude! }
    : undefined;
  if (coordinateValid(jobCoords)) return { address, primaryStop: parts.primaryStop, coords: jobCoords, cacheKey: address };

  const cached = cache[address];
  if (coordinateValid(cached?.coords)) return { address, primaryStop: parts.primaryStop, coords: cached?.coords, cacheKey: address };

  if (!parts.street) return { address, primaryStop: parts.primaryStop, reason: "missing_street", message: reasonLabel("missing_street"), cacheKey: address };
  if (!parts.city) return { address, primaryStop: parts.primaryStop, reason: "missing_city", message: reasonLabel("missing_city"), cacheKey: address };
  if (!parts.state) return { address, primaryStop: parts.primaryStop, reason: "missing_state", message: reasonLabel("missing_state"), cacheKey: address };
  if (!parts.zip) return { address, primaryStop: parts.primaryStop, reason: "missing_zip", message: reasonLabel("missing_zip"), cacheKey: address };
  if (cached?.reason) return { address, primaryStop: parts.primaryStop, reason: cached.reason, message: reasonLabel(cached.reason), cacheKey: address };
  return { address, primaryStop: parts.primaryStop, reason: "not_attempted", message: reasonLabel("not_attempted"), cacheKey: address };
}
