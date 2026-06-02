import { Facility, facilityTypeColors, facilityTypeLabels } from '@/data/facilities';
import { acceptedIcons } from '@/lib/materialIcons';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MapPin } from 'lucide-react';
import { useState, useMemo } from 'react';

interface FacilityListProps {
  facilities: Facility[];
  selectedFacilityId: string | null;
  onSelectFacility: (id: string) => void;
  onFacilityClick?: (facility: Facility) => void;
}

export default function FacilityList({
  facilities,
  selectedFacilityId,
  onSelectFacility,
  onFacilityClick,
}: FacilityListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const filteredFacilities = useMemo(() => {
    return facilities.filter((facility) => {
      const matchesSearch =
        facility.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        facility.address.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = !selectedType || facility.type === selectedType;
      return matchesSearch && matchesType;
    });
  }, [facilities, searchQuery, selectedType]);

  const facilityTypes = Array.from(new Set(facilities.map((f) => f.type)));

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="space-y-3">
        <Input
          placeholder="Search facilities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border-border"
        />

        {/* Type Filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedType(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedType === null
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-border'
            }`}
          >
            All
          </button>
          {facilityTypes.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedType === type
                  ? 'text-white'
                  : 'bg-muted text-muted-foreground hover:bg-border'
              }`}
              style={{
                backgroundColor: selectedType === type ? facilityTypeColors[type] : undefined,
              }}
            >
              {facilityTypeLabels[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Facilities grid */}
      {filteredFacilities.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No facilities found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredFacilities.map((facility) => (
            <button
              key={facility.id}
              onClick={() => {
                onSelectFacility(facility.id);
                onFacilityClick?.(facility);
              }}
              className={`
                h-full text-left p-3 rounded-lg border-2 transition-all duration-300
                hover:shadow-md
                ${
                  selectedFacilityId === facility.id
                    ? 'border-primary bg-primary/5 shadow-md'
                    : 'border-border hover:border-primary/50 bg-card'
                }
              `}
            >
              <div className="flex items-start gap-2">
                <div
                  className="rounded-full p-1 mt-0.5 flex-shrink-0"
                  style={{ backgroundColor: facilityTypeColors[facility.type] }}
                >
                  <MapPin size={12} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight line-clamp-1">{facility.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {facility.address}
                    {facility.city ? `, ${facility.city}` : ''}
                  </p>
                  <div className="flex gap-1 mt-2 flex-wrap items-center">
                    <Badge variant="secondary" className="text-xs">
                      {facilityTypeLabels[facility.type]}
                    </Badge>
                    {acceptedIcons(facility).map((icon) => (
                      <img
                        key={icon.src}
                        src={icon.src}
                        alt={icon.label}
                        title={icon.label}
                        className="h-4 w-4 object-contain"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
