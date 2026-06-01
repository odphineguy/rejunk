import { Facility, facilityTypeColors } from '@/data/facilities';
import { MapPin } from 'lucide-react';

interface FacilityMarkerProps {
  facility: Facility;
  isSelected: boolean;
  onClick: () => void;
}

export default function FacilityMarker({ facility, isSelected, onClick }: FacilityMarkerProps) {
  const color = facilityTypeColors[facility.type];
  
  return (
    <div
      onClick={onClick}
      className={`
        cursor-pointer transition-all duration-300 transform
        ${isSelected ? 'scale-125' : 'scale-100 hover:scale-110'}
      `}
      title={facility.name}
    >
      <div
        className={`
          flex items-center justify-center rounded-full shadow-lg
          transition-all duration-300
          ${isSelected ? 'ring-4 ring-offset-2 ring-offset-background' : ''}
        `}
        style={{
          backgroundColor: color,
          width: isSelected ? '48px' : '40px',
          height: isSelected ? '48px' : '40px',
          borderColor: 'white',
          borderWidth: '2px',
          boxShadow: isSelected ? `0 0 0 4px ${color}40` : '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        <MapPin size={isSelected ? 24 : 20} className="text-white" strokeWidth={2.5} />
      </div>
    </div>
  );
}
