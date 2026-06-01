import { Facility, facilityTypeColors, facilityTypeLabels } from '@/data/facilities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Check, X, Clock, MapPin, Phone, Globe, Calculator } from 'lucide-react';
import { Link } from 'wouter';

interface FacilityDetailsProps {
  facility: Facility;
  onClose: () => void;
}

export default function FacilityDetails({ facility, onClose }: FacilityDetailsProps) {
  const typeColor = facilityTypeColors[facility.type];
  const typeLabel = facilityTypeLabels[facility.type];

  return (
    <Card className="w-full max-w-md shadow-xl border-0" style={{ borderTop: `4px solid ${typeColor}` }}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <Badge
              className="mb-2 text-xs font-medium"
              style={{
                backgroundColor: typeColor,
                color: '#f5f5f0',
              }}
            >
              {typeLabel}
            </Badge>
            <CardTitle className="text-xl md:text-2xl font-bold">{facility.name}</CardTitle>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close details"
          >
            ✕
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed">{facility.description}</p>

        <Separator className="bg-border" />

        {/* Contact Information */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm uppercase tracking-wide text-foreground">Contact</h4>

          <div className="flex items-start gap-3 text-sm">
            <MapPin size={16} className="text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">{facility.address}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Phone size={16} className="text-primary flex-shrink-0" />
            <a href={`tel:${facility.phone}`} className="text-primary hover:underline font-medium">
              {facility.phone}
            </a>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Globe size={16} className="text-primary flex-shrink-0" />
            <a
              href={facility.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium truncate"
            >
              Visit Website
            </a>
          </div>
        </div>

        <Separator className="bg-border" />

        {/* Hours */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-primary" />
            <h4 className="font-semibold text-sm uppercase tracking-wide">Hours</h4>
          </div>
          <div className="space-y-1 text-sm">
            {facility.hours.map((hour, idx) => (
              <p key={idx} className="text-muted-foreground">
                {hour}
              </p>
            ))}
          </div>
        </div>

        <Separator className="bg-border" />

        {/* Pricing */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm uppercase tracking-wide">Pricing</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {facility.pricing.msw && (
              <div className="bg-muted rounded-lg p-2">
                <p className="text-xs text-muted-foreground font-medium">MSW/C&D</p>
                <p className="font-semibold text-foreground">{facility.pricing.msw}</p>
              </div>
            )}
            {facility.pricing.minimum && (
              <div className="bg-muted rounded-lg p-2">
                <p className="text-xs text-muted-foreground font-medium">Minimum</p>
                <p className="font-semibold text-foreground">{facility.pricing.minimum}</p>
              </div>
            )}
          </div>
        </div>

        <Separator className="bg-border" />

        {/* Acceptance */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm uppercase tracking-wide">Accepts</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              {facility.acceptance.tires ? (
                <Check size={16} className="text-green-600" />
              ) : (
                <X size={16} className="text-red-500" />
              )}
              <span className="text-muted-foreground">Tires</span>
            </div>
            <div className="flex items-center gap-2">
              {facility.acceptance.appliances ? (
                <Check size={16} className="text-green-600" />
              ) : (
                <X size={16} className="text-red-500" />
              )}
              <span className="text-muted-foreground">Appliances</span>
            </div>
            <div className="flex items-center gap-2">
              {facility.acceptance.recycling ? (
                <Check size={16} className="text-green-600" />
              ) : (
                <X size={16} className="text-red-500" />
              )}
              <span className="text-muted-foreground">Recycling</span>
            </div>
            <div className="flex items-center gap-2">
              {facility.acceptance.hazardousWaste ? (
                <Check size={16} className="text-green-600" />
              ) : (
                <X size={16} className="text-red-500" />
              )}
              <span className="text-muted-foreground">Hazmat</span>
            </div>
          </div>
        </div>

        <Separator className="bg-border" />

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => {
              window.open(`https://www.google.com/maps/search/${encodeURIComponent(facility.address)}`, '_blank');
            }}
            className="w-full"
            style={{ backgroundColor: typeColor }}
          >
            <MapPin size={16} className="mr-2" />
            Directions
          </Button>
          <Button asChild variant="outline">
            <Link href={`/estimate-builder?facilityId=${encodeURIComponent(facility.id)}`}>
              <Calculator size={16} className="mr-2" />
              Use in Estimate
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
