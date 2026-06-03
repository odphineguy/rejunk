import type { BestFacilityRecommendation, EstimateWarning, FacilityRouteComparison, MaterialCategory, VehicleJobComparison } from "@/types/pricing";

export type JobStatus = "open" | "scheduled" | "on_my_way" | "in_progress" | "completed" | "canceled";

export type PaymentStatus = "unpaid" | "deposit_paid" | "paid" | "refunded";

export type JobSource = "manual" | "estimate" | "demo";

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
