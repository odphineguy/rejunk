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

export type JobServiceType =
  | "junk_removal"
  | "moving"
  | "labor_only"
  | "furniture_assembly"
  | "appliance_moving"
  | "heavy_material_hauling"
  | "delivery"
  | "demolition"
  | "specialty_moving"
  | "other";

export type JobPriority = "low" | "normal" | "high" | "urgent";

export interface JobAssignment {
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
  serviceType?: JobServiceType;
  priority?: JobPriority;
  estimatedDurationMinutes?: number;
  crewSequence?: number;
  /** Required crew size (safety classification, esp. from service/Pricebook estimates). */
  crewSize?: number;
  phone?: string;
  email?: string;
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
  vehicleId?: string;
  vehicleName?: string;
  quotedAmount: number;
  estimatedCost?: number;
  estimatedProfit?: number;
  estimatedMarginDecimal?: number;
  warnings?: EstimateWarning[];
  recommendationSnapshot?: BestFacilityRecommendation;
  facilityRouteComparisons?: FacilityRouteComparison[];
  vehicleJobComparisons?: VehicleJobComparison[];
  assignment?: JobAssignment;
  actuals?: JobCostActuals;
  notes?: string;
  internalNotes?: string;
}
