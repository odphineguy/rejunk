import type { JobDisposalEvent, JobItem, JobStop } from "@/types/driver";
import type { BestFacilityRecommendation, EstimateWarning, FacilityRouteComparison, MaterialCategory, VehicleJobComparison } from "@/types/pricing";

export type DriverJobStatus =
  | "assigned"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "paused"
  | "loaded"
  | "en_route_to_next_stop"
  | "en_route_to_disposal"
  | "dumping"
  | "completed"
  | "delayed"
  | "issue"
  | "canceled";

export type LegacyJobStatus = "open" | "scheduled" | "on_my_way";

export type JobStatus = LegacyJobStatus | DriverJobStatus;

export type PaymentStatus = "unpaid" | "deposit_paid" | "paid" | "refunded";

export type JobSource = "manual" | "estimate" | "demo";

export type JobLeadSource = "thumbtack" | "phone" | "repeat_customer" | "referral" | "website" | "housecall_pro" | "other";

/**
 * The five service types the business actually runs (JOB_TICKET_REDESIGN_SPEC D1).
 * Every ticket is written with one of these; the legacy values below are still
 * accepted on read and mapped through `normalizeServiceType()`.
 */
export type CanonicalJobServiceType = "moving" | "delivery" | "assembly_handyman" | "junk_removal" | "other";

/** Legacy values still found in old job blobs — read, never written. */
export type LegacyJobServiceType =
  | "labor_only"
  | "furniture_assembly"
  | "appliance_moving"
  | "heavy_material_hauling"
  | "demolition"
  | "specialty_moving";

export type JobServiceType = CanonicalJobServiceType | LegacyJobServiceType;

/** Sub-kind of a `moving` ticket — fixes crew and time shape from the rate card. */
export type MovingKind =
  | "small_move"
  | "studio_1br"
  | "two_br"
  | "small_house"
  | "hourly_2"
  | "hourly_3"
  | "hourly_4"
  | "labor_only"
  | "piano";

/** Sub-kind of a `delivery` ticket. */
export type DeliveryKind = "cargo_van" | "van_flat";

export type JobDayType = "weekday" | "weekend";

export type JobPaymentTerms = "deposit" | "full_upfront";

export type JobCrewRole = "lead" | "driver" | "helper";

export interface JobCrewMember {
  employeeId: string;
  role: JobCrewRole;
}

export interface JobQuote {
  tier: string;
  low: number;
  high: number;
  includedHours?: number;
  source: "david" | "estimate" | "manual";
}

export interface JobTvInstall {
  count: number;
  sizes: string[];
  locations: ("pickup" | "delivery")[];
}

export interface JobEscalation {
  reason: string;
  resolvedAt?: string;
}

export interface JobLeadRef {
  source: "thumbtack" | "website" | "hcp" | "direct";
  negotiationId?: string;
  hcpJobId?: string;
}

/** Moving-specific details a ticket inherits from the estimate (v19 snapshot lands later). */
export interface MovingDetails {
  homeSize?: string;
  stories?: number;
  pickupFlights?: number;
  deliveryFlights?: number;
  piano?: string;
  packing?: boolean;
  distanceMiles?: number;
}

export type JobPriority = "low" | "normal" | "high" | "urgent";

/**
 * @deprecated Legacy assignment blob (names + duplicated vehicle). Tolerated on
 * read so old tickets still resolve; never written since the ticket redesign —
 * `Job.crew` and `Job.vehicleId` are the single source of truth.
 */
export interface JobAssignment {
  /** Stable ids for database authorization; names are display-only. */
  employeeIds?: string[];
  crewLead?: string;
  crewMembers?: string[];
  vehicleId?: string;
  vehicleName?: string;
}

export interface JobCostActuals {
  disposalCost?: number;
  laborCost?: number;
  fuelCost?: number;
  chargedAmount?: number;
  dumpReceiptUrl?: string;
  receiptNumber?: string;
  scaleTicketNumber?: string;
  disposalFacilityId?: string;
  grossWeight?: number;
  tareWeight?: number;
  netWeightTons?: number;
  disposalTotal?: number;
  receiptNotes?: string;
  updatedAt?: string;
}

export interface Job {
  id: string;
  jobNumber: string;
  source: JobSource;
  sourceEstimateId?: string;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  jobLabel?: string;
  leadSource?: JobLeadSource;
  /** What kind of work this is — the first thing a ticket knows. Always set after `normalizeJob()`. */
  serviceType: JobServiceType;
  /** Required when serviceType is `moving`. */
  movingKind?: MovingKind;
  /** Required when serviceType is `delivery`. */
  deliveryKind?: DeliveryKind;
  priority?: JobPriority;
  estimatedDurationMinutes?: number;
  crewSequence?: number;
  /**
   * @deprecated Old name for `requiredCrew`; still read from old blobs.
   */
  crewSize?: number;
  /** Safety floor for the crew (2 for moving, 1 for van flat / assembly, ...). */
  requiredCrew: number;
  /** Who is on this job. Names resolve from the employee list at render time. */
  crew: JobCrewMember[];
  /** Ordered service locations. ≥1; moving = pickup + delivery; junk = service stop. */
  stops: JobStop[];
  /** Optional checklist the crew sees (never prices). */
  items: JobItem[];
  /** Planned / completed disposal trips (junk removal only). */
  disposalEvents?: JobDisposalEvent[];
  /** Phoenix rule incl. month-end; stored at booking, never recomputed on read. */
  dayType?: JobDayType;
  quote?: JobQuote;
  /** `full_upfront` = labor-only or a third-party pickup (ops rule). */
  paymentTerms?: JobPaymentTerms;
  thirdPartyPickup?: boolean;
  tvInstall?: JobTvInstall;
  escalation?: JobEscalation;
  leadRef?: JobLeadRef;
  /** CRM link (Clients & Leads). */
  clientId?: string;
  moving?: MovingDetails;
  phone?: string;
  email?: string;
  /** Read-only mirror of `stops[0]` (kept for the Jobs list, search, geocoding). */
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  status: JobStatus;
  paymentStatus: PaymentStatus;
  materialType?: MaterialCategory;
  materialName?: string;
  cubicYards?: number;
  estimatedWeightLbs?: number;
  estimatedTons?: number;
  facilityId?: string;
  facilityName?: string;
  /** Fleet unit id (spr-01 … box-01). The ONE place the vehicle lives. */
  vehicleId?: string;
  /** Display mirror of `vehicleId`, resolved from the vehicle list on save. */
  vehicleName?: string;
  quotedAmount: number;
  estimatedCost?: number;
  estimatedProfit?: number;
  estimatedMarginDecimal?: number;
  warnings?: EstimateWarning[];
  recommendationSnapshot?: BestFacilityRecommendation;
  facilityRouteComparisons?: FacilityRouteComparison[];
  vehicleJobComparisons?: VehicleJobComparison[];
  /** @deprecated see JobAssignment — read-only legacy. */
  assignment?: JobAssignment;
  actuals?: JobCostActuals;
  notes?: string;
  internalNotes?: string;
}
