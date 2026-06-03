export type FacilityType =
  | "landfill"
  | "transfer_station"
  | "recycling_center"
  | "specialty_facility"
  | "scrap_yard"
  | "green_waste"
  | "clean_fill";

export type MaterialCategory =
  | "household_junk"
  | "furniture"
  | "appliances"
  | "mattresses"
  | "tires"
  | "mixed_c_and_d"
  | "clean_concrete"
  | "clean_tile"
  | "brick"
  | "dirt"
  | "rock"
  | "green_waste"
  | "metal"
  | "cardboard"
  | "hazardous_excluded";

export type FacilityPriceType = "per_ton" | "flat_fee" | "per_item" | "free" | "payout";

export type VehicleType =
  | "cargo_van"
  | "box_truck"
  | "dump_trailer"
  | "pickup_truck"
  | "passenger_van"
  | "other";

export type MaterialPricingMode =
  | "volume_based"
  | "weight_based"
  | "item_based"
  | "hybrid"
  | "payout"
  | "excluded";

export interface DisposalFacility {
  id: string;
  facilityName: string;
  facilityType: FacilityType;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  website?: string;
  latitude: number;
  longitude: number;
  acceptedMaterials: MaterialCategory[];
  rejectedMaterials: MaterialCategory[];
  priceType: FacilityPriceType;
  defaultRate: number;
  minimumCharge: number;
  environmentalFee: number;
  fuelSurcharge: number;
  extraFees: number;
  hours: string[];
  notes?: string;
  bestUseCase?: string;
  pricingImpactLabel?: string;
  lastVerifiedDate?: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface FacilityAcceptanceFlags {
  tires: boolean;
  appliances: boolean;
  recycling: boolean;
  hazardousWaste: boolean;
}

export interface LegacyFacilityPricing {
  msw?: string;
  minimum?: string;
}

export interface Facility extends DisposalFacility {
  name: string;
  type: FacilityType;
  lat: number;
  lng: number;
  description: string;
  pricing: LegacyFacilityPricing;
  acceptance: FacilityAcceptanceFlags;
}

export interface Vehicle {
  id: string;
  vehicleName: string;
  vehicleType: VehicleType;
  usableCubicYards: number;
  maxPayloadLbs: number;
  emptyWeightLbs?: number;
  gvwrLbs?: number;
  fuelType: string;
  mpgUnloaded: number;
  mpgLoaded: number;
  hourlyVehicleCost?: number;
  mileageCost?: number;
  hasLiftgate: boolean;
  hasDumpCapability: boolean;
  requiresTowVehicle: boolean;
  notes?: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface MaterialPricingRule {
  id: string;
  materialName: string;
  materialCategory: MaterialCategory;
  defaultDensityLbsPerYard: number;
  densityRangeLbsPerYard?: [number, number];
  pricingMode: MaterialPricingMode;
  requiresWeightOverride: boolean;
  preferredFacilityTypes: FacilityType[];
  warningText?: string;
  laborDifficultyMultiplier: number;
  disposalDifficultyMultiplier: number;
  notes?: string;
  isActive?: boolean;
}

export interface VolumePricingBenchmark {
  id: string;
  label: string;
  fraction: number;
  price: number;
}

export interface ExtraFee {
  id: string;
  name: string;
  amount: number;
}

export interface PricingSettings {
  disposalFacilities: Facility[];
  vehicles: Vehicle[];
  materialPricingRules: MaterialPricingRule[];
  volumePricingBenchmarks: VolumePricingBenchmark[];
  defaults: {
    fuelPricePerGallon: number;
    workers: number;
    hourlyLaborCost: number;
    estimatedHours: number;
    targetMarginDecimal: number;
    minimumProfitDollars: number;
    defaultFacilityRatePerTon: number;
  };
}

export interface EstimateCalculatorInput {
  materialRule: MaterialPricingRule;
  vehicle: Vehicle;
  facility: DisposalFacility;
  loadFraction?: number;
  cubicYards?: number;
  manualWeightLbs?: number;
  overrideDisposalRate?: number;
  itemCount?: number;
  workers?: number;
  estimatedHours?: number;
  hourlyLaborCost?: number;
  roundTripMiles?: number;
  fuelPricePerGallon?: number;
  mpg?: number;
  manualFuelCost?: number;
  extraFees?: ExtraFee[];
  targetMarginDecimal?: number;
  minimumProfitDollars?: number;
  volumeBenchmarkPrice?: number;
  minimumAcceptablePrice?: number;
}

export type EstimateWarningCode =
  | "excluded_material"
  | "payload_exceeded"
  | "payload_near_limit"
  | "heavy_material"
  | "facility_rejects_material"
  | "facility_not_verified_recently"
  | "multiple_trips_likely"
  | "vehicle_mismatch"
  | "margin_below_target";

export interface EstimateWarning {
  code: EstimateWarningCode;
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface EstimateCalculationResult {
  cubicYards: number;
  estimatedWeightLbs: number;
  estimatedTons: number;
  laborCost: number;
  disposalCost: number;
  fuelCost: number;
  vehicleCost: number;
  extraFeesTotal: number;
  baseCost: number;
  recommendedQuote: number;
  minimumQuote: number;
  finalRecommendedQuote: number;
  grossProfitDollars: number;
  grossMarginDecimal: number;
  selectedVolumeBenchmark?: number;
  payloadStatus: "ok" | "near_limit" | "over_limit";
  warnings: EstimateWarning[];
}

export interface JobRouteEstimate {
  jobAddress?: string;
  facilityId: string;
  oneWayMiles: number | null;
  roundTripMiles: number | null;
  estimatedDriveMinutes: number | null;
  source: "google_maps" | "manual" | "fallback" | "unavailable";
}

export interface FacilityRouteComparison {
  jobAddress?: string;
  facilityId: string;
  facilityName: string;
  oneWayMiles: number | null;
  roundTripMiles: number | null;
  estimatedDriveMinutes: number | null;
  fuelCost: number;
  vehicleCost: number;
  disposalCost: number;
  totalOperationalCost: number;
  acceptedMaterial: boolean;
  pricingStale: boolean;
  warnings: string[];
}

export interface VehicleJobComparison {
  jobAddress?: string;
  vehicleId: string;
  vehicleName: string;
  vehicleType: VehicleType;
  cubicYardCapacity: number;
  payloadCapacityLbs: number;
  mpg: number;
  operatingCostPerMile: number;
  estimatedWeightLbs: number;
  estimatedTons: number;
  tripsRequired: number;
  oneWayMiles: number | null;
  roundTripMiles: number | null;
  estimatedDriveMinutes: number | null;
  fuelCost: number;
  vehicleCost: number;
  disposalCost: number;
  totalOperationalCost: number;
  estimatedProfit: number;
  payloadWarning?: string;
  acceptedMaterial: boolean;
  pricingStale: boolean;
  warnings: string[];
}

export interface BestFacilityRecommendation {
  jobAddress?: string;
  facilityId: string;
  facilityName: string;
  vehicleId?: string;
  vehicleName?: string;
  selectedFacilityId?: string;
  selectedVehicleId?: string;
  selectedTotalCost: number;
  recommendedTotalCost: number;
  estimatedSavings: number;
  distanceDifferenceMiles: number | null;
  driveTimeDifferenceMinutes: number | null;
  reason: string;
  facilityComparison?: FacilityRouteComparison;
  vehicleComparison?: VehicleJobComparison;
  warnings: string[];
}

export interface SavedEstimate {
  id: string;
  createdAt: string;
  updatedAt: string;
  customerName?: string;
  jobAddress?: string;
  loadLabel?: string;
  loadFraction?: number;
  materialName?: string;
  materialType: MaterialCategory;
  materialRuleId?: string;
  vehicleName?: string;
  vehicleId: string;
  facilityName?: string;
  facilityId: string;
  cubicYards: number;
  manualCubicYards?: number;
  manualWeightLbs?: number;
  estimatedWeightLbs: number;
  estimatedTons?: number;
  disposalCost: number;
  laborCost: number;
  fuelCost: number;
  vehicleCost: number;
  extraFees: ExtraFee[];
  extraFeesTotal?: number;
  baseCost: number;
  minimumQuote?: number;
  recommendedQuote: number;
  quoteRangeLower?: number;
  quoteRangeUpper?: number;
  finalQuote: number;
  grossProfitDollars?: number;
  grossMarginDecimal?: number;
  payloadStatus?: EstimateCalculationResult["payloadStatus"];
  warnings?: EstimateWarning[];
  workers?: number;
  estimatedHours?: number;
  hourlyLaborCost?: number;
  roundTripMiles?: number;
  mpg?: number;
  fuelPricePerGallon?: number;
  targetMarginDecimal?: number;
  minimumProfitDollars?: number;
  recommendationSnapshot?: BestFacilityRecommendation;
  notes?: string;
}
