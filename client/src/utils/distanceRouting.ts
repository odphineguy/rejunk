import type { DisposalFacility, JobRouteEstimate } from "@/types/pricing";

interface DistanceResult {
  oneWayMiles: number | null;
  roundTripMiles: number | null;
  estimatedDriveMinutes: number | null;
}

const METERS_PER_MILE = 1609.344;

function round(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function facilityAddress(facility: Pick<DisposalFacility, "address" | "city" | "state" | "zip">) {
  return [facility.address, facility.city, facility.state, facility.zip].filter(Boolean).join(", ");
}

export function emptyRouteEstimate(jobAddress: string | undefined, facilityId: string): JobRouteEstimate {
  return {
    jobAddress,
    facilityId,
    oneWayMiles: null,
    roundTripMiles: null,
    estimatedDriveMinutes: null,
    source: "unavailable",
  };
}

export function manualRouteEstimate(jobAddress: string | undefined, facilityId: string, roundTripMiles: number): JobRouteEstimate {
  const miles = Number.isFinite(roundTripMiles) && roundTripMiles > 0 ? roundTripMiles : 0;
  return {
    jobAddress,
    facilityId,
    oneWayMiles: round(miles / 2),
    roundTripMiles: round(miles),
    estimatedDriveMinutes: round(miles * 2.2, 0),
    source: "manual",
  };
}

function fromDistanceMatrix(response: google.maps.DistanceMatrixResponse | null): DistanceResult | null {
  const element = response?.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK" || !element.distance || !element.duration) {
    return null;
  }

  const oneWayMiles = element.distance.value / METERS_PER_MILE;
  return {
    oneWayMiles: round(oneWayMiles),
    roundTripMiles: round(oneWayMiles * 2),
    estimatedDriveMinutes: round((element.duration.value / 60) * 2, 0),
  };
}

export async function getDistanceToFacility(jobAddress: string, facilityAddress: string): Promise<DistanceResult> {
  const origin = jobAddress.trim();
  const destination = facilityAddress.trim();

  if (!origin || !destination || typeof window === "undefined" || !window.google?.maps?.DistanceMatrixService) {
    return { oneWayMiles: null, roundTripMiles: null, estimatedDriveMinutes: null };
  }

  try {
    const service = new window.google.maps.DistanceMatrixService();
    const result = await new Promise<DistanceResult | null>((resolve) => {
      service.getDistanceMatrix(
        {
          origins: [origin],
          destinations: [destination],
          travelMode: window.google.maps.TravelMode.DRIVING,
          unitSystem: window.google.maps.UnitSystem.IMPERIAL,
        },
        (response, status) => {
          if (status !== "OK") {
            resolve(null);
            return;
          }
          resolve(fromDistanceMatrix(response));
        },
      );
    });

    return result ?? { oneWayMiles: null, roundTripMiles: null, estimatedDriveMinutes: null };
  } catch {
    return { oneWayMiles: null, roundTripMiles: null, estimatedDriveMinutes: null };
  }
}

export interface PointToPointRoute {
  miles: number | null;
  driveMinutes: number | null;
}

/** One-way route between two addresses (moving pickup → delivery). Same Distance
 * Matrix call as the facility routing, but NOT doubled to a round trip. */
export async function getPointToPointRoute(origin: string, destination: string): Promise<PointToPointRoute> {
  const result = await getDistanceToFacility(origin, destination);
  return {
    miles: result.oneWayMiles,
    // getDistanceToFacility doubles duration for the round trip — halve it back.
    driveMinutes: result.estimatedDriveMinutes == null ? null : Math.round(result.estimatedDriveMinutes / 2),
  };
}

export async function getRouteEstimateToFacility(jobAddress: string | undefined, facility: DisposalFacility): Promise<JobRouteEstimate> {
  if (!jobAddress?.trim()) {
    return emptyRouteEstimate(jobAddress, facility.id);
  }

  const result = await getDistanceToFacility(jobAddress, facilityAddress(facility));
  return {
    jobAddress,
    facilityId: facility.id,
    ...result,
    source: result.roundTripMiles == null ? "unavailable" : "google_maps",
  };
}
