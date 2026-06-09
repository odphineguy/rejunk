/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map; // Store to control map from parent anytime, google map itself is in charge of the re-rendering, not react state.
 * </MapView>
 *
 * ======
 * Available Libraries and Core Features:
 * -------------------------------
 * 📍 MARKER (from `marker` library)
 * - Attaches to map using { map, position }
 * new google.maps.marker.AdvancedMarkerElement({
 *   map,
 *   position: { lat: 37.7749, lng: -122.4194 },
 *   title: "San Francisco",
 * });
 *
 * -------------------------------
 * 🏢 PLACES (from `places` library)
 * - Does not attach directly to map; use data with your map manually.
 * const place = new google.maps.places.Place({ id: PLACE_ID });
 * await place.fetchFields({ fields: ["displayName", "location"] });
 * map.setCenter(place.location);
 * new google.maps.marker.AdvancedMarkerElement({ map, position: place.location });
 *
 * -------------------------------
 * 🧭 GEOCODER (from `geocoding` library)
 * - Standalone service; manually apply results to map.
 * const geocoder = new google.maps.Geocoder();
 * geocoder.geocode({ address: "New York" }, (results, status) => {
 *   if (status === "OK" && results[0]) {
 *     map.setCenter(results[0].geometry.location);
 *     new google.maps.marker.AdvancedMarkerElement({
 *       map,
 *       position: results[0].geometry.location,
 *     });
 *   }
 * });
 *
 * -------------------------------
 * 📐 GEOMETRY (from `geometry` library)
 * - Pure utility functions; not attached to map.
 * const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
 *
 * -------------------------------
 * 🛣️ ROUTES (from `routes` library)
 * - Combines DirectionsService (standalone) + DirectionsRenderer (map-attached)
 * const directionsService = new google.maps.DirectionsService();
 * const directionsRenderer = new google.maps.DirectionsRenderer({ map });
 * directionsService.route(
 *   { origin, destination, travelMode: "DRIVING" },
 *   (res, status) => status === "OK" && directionsRenderer.setDirections(res)
 * );
 *
 * -------------------------------
 * 🌦️ MAP LAYERS (attach directly to map)
 * - new google.maps.TrafficLayer().setMap(map);
 * - new google.maps.TransitLayer().setMap(map);
 * - new google.maps.BicyclingLayer().setMap(map);
 *
 * -------------------------------
 * ✅ SUMMARY
 * - “map-attached” → AdvancedMarkerElement, DirectionsRenderer, Layers.
 * - “standalone” → Geocoder, DirectionsService, DistanceMatrixService, ElevationService.
 * - “data-only” → Place, Geometry utilities.
 */

/// <reference types="@types/google.maps" />

import { ReactNode, useEffect, useRef, useState } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const MAPS_PROXY_URL = "/maps-proxy";
const FRONTEND_GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export function loadMapScript() {
  if (window.google?.maps) {
    console.info("[Map] Google Maps already present on window.");
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const hasFrontendKey = Boolean(FRONTEND_GOOGLE_MAPS_API_KEY);
    const frontendKey = FRONTEND_GOOGLE_MAPS_API_KEY ?? "";
    const scriptUrl = hasFrontendKey
      ? `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(frontendKey)}&v=weekly&libraries=marker,places,geocoding,geometry`
      : `${MAPS_PROXY_URL}/maps/api/js?v=weekly&libraries=marker,places,geocoding,geometry`;

    console.info(`[Map] Google Maps API key ${hasFrontendKey ? "present via VITE_GOOGLE_MAPS_API_KEY" : "missing in frontend env; trying server proxy"}.`);
    script.src = scriptUrl;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if (window.google?.maps) {
        console.info("[Map] Google Maps load success.");
        resolve();
      } else {
        reject(new Error("Google Maps script loaded without exposing window.google.maps"));
      }
    };
    script.onerror = () => {
      reject(new Error(`Failed to load Google Maps script from ${hasFrontendKey ? "Google Maps API" : "local server proxy"}`));
    };
    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Driver markers (live GPS layer on the Dispatch Center map)
// ---------------------------------------------------------------------------

/** Colored circle with the driver's first initial; faded at 50% when offline. */
export function createDriverMarkerContent({ hex, initial, online }: { hex: string; initial: string; online: boolean }) {
  const element = document.createElement("div");
  element.className =
    "flex size-10 items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white shadow-lg";
  element.style.background = hex;
  element.style.opacity = online ? "1" : "0.5";
  element.style.transition = "opacity 300ms ease";
  element.textContent = initial;
  return element;
}

function toLatLngLiteral(position: google.maps.marker.AdvancedMarkerElement["position"]): google.maps.LatLngLiteral | null {
  if (!position) return null;
  if (typeof (position as google.maps.LatLng).lat === "function") {
    const latLng = position as google.maps.LatLng;
    return { lat: latLng.lat(), lng: latLng.lng() };
  }
  const literal = position as google.maps.LatLngLiteral;
  return typeof literal.lat === "number" && typeof literal.lng === "number" ? { lat: literal.lat, lng: literal.lng } : null;
}

const markerAnimations = new WeakMap<google.maps.marker.AdvancedMarkerElement, number>();

/** Lerps a marker to a new position with requestAnimationFrame (~0.9s ease). */
export function animateMarkerTo(
  marker: google.maps.marker.AdvancedMarkerElement,
  target: google.maps.LatLngLiteral,
  durationMs = 900,
) {
  const from = toLatLngLiteral(marker.position);
  if (!from) {
    marker.position = target;
    return;
  }
  const previous = markerAnimations.get(marker);
  if (previous !== undefined) cancelAnimationFrame(previous);

  const startedAt = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / durationMs);
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
    marker.position = {
      lat: from.lat + (target.lat - from.lat) * eased,
      lng: from.lng + (target.lng - from.lng) * eased,
    };
    if (progress < 1) {
      markerAnimations.set(marker, requestAnimationFrame(step));
    } else {
      markerAnimations.delete(marker);
    }
  };
  markerAnimations.set(marker, requestAnimationFrame(step));
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
  fallback?: (error: string) => ReactNode;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  onMapReady,
  fallback,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const init = usePersistFn(async () => {
    try {
      await loadMapScript();
      if (!mapContainer.current) {
        throw new Error("Map container not found");
      }
      map.current = new window.google.maps.Map(mapContainer.current, {
        zoom: initialZoom,
        center: initialCenter,
        mapTypeControl: true,
        fullscreenControl: true,
        zoomControl: true,
        streetViewControl: true,
        mapId: "DEMO_MAP_ID",
      });
      setLoadError(null);
      if (onMapReady) {
        onMapReady(map.current);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load Google Maps";
      console.error(`[Map] Google Maps load failure: ${message}`);
      console.warn(`[Map] Falling back to local facility map. Reason: ${message}`);
      setLoadError(message);
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className={cn("relative h-[500px] w-full bg-muted", className)}>
      <div ref={mapContainer} className="absolute inset-0" />
      {loadError && (
        fallback ? (
          <div className="absolute inset-0">{fallback(loadError)}</div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/95 p-6 text-center">
            <div className="max-w-md rounded-lg border border-border bg-card p-5 shadow-sm">
              <AlertCircle className="mx-auto mb-3 size-6 text-destructive" />
              <h3 className="text-lg font-semibold">Map unavailable</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                The facility list is still available, but Google Maps could not load. Check the local Maps proxy/API credentials and refresh.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">{loadError}</p>
            </div>
          </div>
        )
      )}
    </div>
  );
}

export default MapView;
