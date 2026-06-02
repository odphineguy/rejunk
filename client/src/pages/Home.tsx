import { useState, useCallback, useRef, useEffect } from 'react';
import MapView from '@/components/Map';
import FacilityDetails from '@/components/FacilityDetails';
import FacilityList from '@/components/FacilityList';
import { Facility, facilityTypeColors } from '@/data/facilities';
import { loadPricingSettings } from '@/utils/pricingStorage';
import { AlertCircle, MapPin } from 'lucide-react';

/**
 * Design Philosophy: Eco-Conscious Organic
 * - Forest green primary color (#2d5016) for buttons and interactive elements
 * - Warm earth brown (#8b6f47) for secondary accents
 * - Rounded corners (16px) for organic feel
 * - Smooth 300ms animations with ease-out timing
 * - Playfair Display for headings, Lato for body text
 * - Curved SVG dividers between sections
 */

export default function Home() {
  // Single source of truth: facilities come from saved pricing settings (Supabase-backed,
  // hydrated at startup). Editing a facility in Settings updates the map automatically.
  const [facilities, setFacilities] = useState<Facility[]>(() => loadPricingSettings().disposalFacilities);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());

  const selectedFacility = selectedFacilityId ? facilities.find((f) => f.id === selectedFacilityId) ?? null : null;

  // Refresh the list when settings finish loading from Supabase or are edited.
  useEffect(() => {
    const refresh = () => setFacilities(loadPricingSettings().disposalFacilities);
    window.addEventListener('pricing-settings-updated', refresh);
    return () => window.removeEventListener('pricing-settings-updated', refresh);
  }, []);

  const handleMapReady = useCallback((mapInstance: google.maps.Map) => {
    mapRef.current = mapInstance;
    // Center map on Arizona
    mapInstance.setCenter({ lat: 33.7298, lng: -111.4312 });
    mapInstance.setZoom(9);
    setMap(mapInstance);
  }, []);

  // (Re)build markers whenever the map becomes ready or the facility list changes.
  useEffect(() => {
    if (!map) return;

    // Remove any existing markers before redrawing.
    markersRef.current.forEach((marker) => {
      marker.map = null;
    });
    markersRef.current.clear();

    facilities.forEach((facility) => {
      const color = facilityTypeColors[facility.type];

      // Create custom marker element
      const markerElement = document.createElement('div');
      markerElement.style.width = '40px';
      markerElement.style.height = '40px';
      markerElement.style.backgroundColor = color;
      markerElement.style.borderRadius = '50%';
      markerElement.style.display = 'flex';
      markerElement.style.alignItems = 'center';
      markerElement.style.justifyContent = 'center';
      markerElement.style.border = '2px solid white';
      markerElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      markerElement.style.cursor = 'pointer';
      markerElement.style.transition = 'all 0.3s ease';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '20');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'white');
      svg.setAttribute('stroke-width', '2.5');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z');

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '10');
      circle.setAttribute('r', '3');

      svg.appendChild(path);
      svg.appendChild(circle);
      markerElement.appendChild(svg);

      // Create advanced marker
      const advancedMarker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: facility.lat, lng: facility.lng },
        map,
        title: facility.name,
        content: markerElement,
      });

      // Add click listener to marker
      advancedMarker.addListener('click', () => {
        setSelectedFacilityId(facility.id);
        map.panTo({ lat: facility.lat, lng: facility.lng });
        map.setZoom(12);
      });

      // Add hover effects
      markerElement.addEventListener('mouseenter', () => {
        markerElement.style.transform = 'scale(1.2)';
        markerElement.style.boxShadow = `0 8px 24px ${color}60`;
      });

      markerElement.addEventListener('mouseleave', () => {
        markerElement.style.transform = 'scale(1)';
        markerElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      });

      markersRef.current.set(facility.id, advancedMarker);
    });

    return () => {
      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
      markersRef.current.clear();
    };
  }, [map, facilities]);

  const handleSelectFacility = useCallback(
    (facilityId: string) => {
      setSelectedFacilityId(facilityId);
      const facility = facilities.find((f) => f.id === facilityId);
      if (facility && mapRef.current) {
        mapRef.current.panTo({ lat: facility.lat, lng: facility.lng });
        mapRef.current.setZoom(12);
      }
    },
    [facilities],
  );

  return (
    <div className="space-y-6 px-4 py-6 md:px-6">
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium text-muted-foreground">Facility map</div>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">Arizona Disposal Facilities</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Browse facility coverage, select a disposal site, and send it into the estimate flow when needed.
        </p>
      </div>

      <div className="relative">
        <section className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <MapView
            className="h-[58vh] min-h-[520px]"
            onMapReady={handleMapReady}
            fallback={(error) => (
              <LocalFacilityMap
                facilities={facilities}
                selectedFacilityId={selectedFacilityId}
                error={error}
                onSelectFacility={handleSelectFacility}
              />
            )}
          />
        </section>

        {selectedFacility && (
          <div className="absolute left-4 right-4 top-4 z-30 animate-in fade-in slide-in-from-top-2 duration-300 md:left-6 md:right-auto md:top-6 md:w-96">
            <FacilityDetails
              facility={selectedFacility}
              onClose={() => setSelectedFacilityId(null)}
            />
          </div>
        )}
      </div>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:p-6">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">Facility Directory</h2>
          <p className="text-sm text-muted-foreground">Search and filter facilities without leaving the map page.</p>
        </div>
        <FacilityList
          facilities={facilities}
          selectedFacilityId={selectedFacilityId}
          onSelectFacility={handleSelectFacility}
          onFacilityClick={() => undefined}
        />
      </section>
    </div>
  );
}

function LocalFacilityMap({
  facilities,
  selectedFacilityId,
  error,
  onSelectFacility,
}: {
  facilities: Facility[];
  selectedFacilityId: string | null;
  error: string;
  onSelectFacility: (id: string) => void;
}) {
  const bounds = facilities.reduce(
    (acc, facility) => ({
      minLat: Math.min(acc.minLat, facility.lat),
      maxLat: Math.max(acc.maxLat, facility.lat),
      minLng: Math.min(acc.minLng, facility.lng),
      maxLng: Math.max(acc.maxLng, facility.lng),
    }),
    {
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
      minLng: Number.POSITIVE_INFINITY,
      maxLng: Number.NEGATIVE_INFINITY,
    },
  );

  const latRange = bounds.maxLat - bounds.minLat || 1;
  const lngRange = bounds.maxLng - bounds.minLng || 1;

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden bg-[#efe9dc]">
      <div className="absolute inset-0 bg-[linear-gradient(30deg,rgba(139,111,71,0.12)_12%,transparent_12%,transparent_88%,rgba(139,111,71,0.12)_88%),linear-gradient(120deg,rgba(45,80,22,0.10)_10%,transparent_10%,transparent_90%,rgba(45,80,22,0.10)_90%)] bg-[length:160px_160px]" />
      <div className="absolute left-[12%] top-[18%] h-[72%] w-[2px] rotate-[22deg] bg-primary/25" />
      <div className="absolute left-[35%] top-[8%] h-[86%] w-[3px] rotate-[-18deg] bg-secondary/25" />
      <div className="absolute left-[8%] top-[58%] h-[2px] w-[84%] rotate-[-5deg] bg-primary/20" />
      <div className="absolute left-[18%] top-[38%] h-[2px] w-[70%] rotate-[8deg] bg-secondary/20" />

      <div className="absolute left-4 top-4 z-20 max-w-sm rounded-lg border border-border bg-card/95 p-3 shadow-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 text-amber-600" />
          <div>
            <p className="text-sm font-semibold">Local map fallback</p>
            <p className="text-xs text-muted-foreground">Google Maps did not load, so this view is using facility coordinates locally.</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-20 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">
        Phoenix-area disposal facilities
      </div>

      {facilities.map((facility) => {
        const left = 8 + ((facility.lng - bounds.minLng) / lngRange) * 84;
        const top = 8 + ((bounds.maxLat - facility.lat) / latRange) * 84;
        const color = facilityTypeColors[facility.type];
        const isSelected = selectedFacilityId === facility.id;

        return (
          <button
            key={facility.id}
            onClick={() => onSelectFacility(facility.id)}
            className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border-2 border-white px-2 py-1 text-xs font-semibold text-white shadow-lg transition-transform hover:scale-110 ${
              isSelected ? 'scale-125 ring-4 ring-primary/25' : ''
            }`}
            style={{ left: `${left}%`, top: `${top}%`, backgroundColor: color }}
            title={facility.name}
          >
            <MapPin size={14} />
            <span className="hidden max-w-40 truncate lg:inline">{facility.name}</span>
          </button>
        );
      })}
    </div>
  );
}
