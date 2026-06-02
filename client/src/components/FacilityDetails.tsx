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
    <Card
      className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden border-0 shadow-xl"
      style={{ borderTop: `4px solid ${typeColor}` }}
    >
      {/* Header — stays put so the close button is always reachable */}
      <CardHeader className="shrink-0 p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <Badge className="mb-1.5 text-xs font-medium" style={{ backgroundColor: typeColor, color: '#f5f5f0' }}>
              {typeLabel}
            </Badge>
            <CardTitle className="text-lg font-bold leading-tight">{facility.name}</CardTitle>
          </div>
          <button
            onClick={onClose}
            className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close details"
          >
            <X size={18} />
          </button>
        </div>
      </CardHeader>

      {/* Body — scrolls if the content is taller than the card */}
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-0">
        {facility.description && (
          <p className="text-sm leading-snug text-muted-foreground line-clamp-2">{facility.description}</p>
        )}

        <Separator className="bg-border" />

        {/* Contact */}
        <div className="space-y-1.5 text-sm">
          <div className="flex items-start gap-2.5">
            <MapPin size={15} className="mt-0.5 flex-shrink-0 text-primary" />
            <span className="font-medium">{facility.address}</span>
          </div>
          {facility.phone && (
            <div className="flex items-center gap-2.5">
              <Phone size={15} className="flex-shrink-0 text-primary" />
              <a href={`tel:${facility.phone}`} className="font-medium text-primary hover:underline">
                {facility.phone}
              </a>
            </div>
          )}
          {facility.website && (
            <div className="flex items-center gap-2.5">
              <Globe size={15} className="flex-shrink-0 text-primary" />
              <a
                href={facility.website}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                Visit Website
              </a>
            </div>
          )}
        </div>

        <Separator className="bg-border" />

        {/* Hours */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-primary" />
            <h4 className="text-xs font-semibold uppercase tracking-wide">Hours</h4>
          </div>
          <div className="text-sm text-muted-foreground">
            {facility.hours.map((hour, idx) => (
              <p key={idx}>{hour}</p>
            ))}
          </div>
        </div>

        <Separator className="bg-border" />

        {/* Pricing */}
        {(facility.pricing.msw || facility.pricing.minimum) && (
          <>
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide">Pricing</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {facility.pricing.msw && (
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-xs font-medium text-muted-foreground">MSW/C&amp;D</p>
                    <p className="font-semibold text-foreground">{facility.pricing.msw}</p>
                  </div>
                )}
                {facility.pricing.minimum && (
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-xs font-medium text-muted-foreground">Minimum</p>
                    <p className="font-semibold text-foreground">{facility.pricing.minimum}</p>
                  </div>
                )}
              </div>
            </div>
            <Separator className="bg-border" />
          </>
        )}

        {/* Acceptance */}
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide">Accepts</h4>
          <div className="grid grid-cols-2 gap-1.5 text-sm">
            {[
              { label: 'Tires', ok: facility.acceptance.tires },
              { label: 'Appliances', ok: facility.acceptance.appliances },
              { label: 'Recycling', ok: facility.acceptance.recycling },
              { label: 'Hazmat', ok: facility.acceptance.hazardousWaste },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                {item.ok ? <Check size={15} className="text-green-600" /> : <X size={15} className="text-red-500" />}
                <span className="text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>

      {/* Footer actions — stay put */}
      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border p-4">
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
    </Card>
  );
}
