export type PricebookItemType = "Service" | "Product" | "Fee";

/** How the `price` number should be read / applied. Default "flat". */
export type PricebookPriceUnit = "flat" | "hourly" | "per_item" | "per_mile" | "per_30min" | "percent";

/** Pricebook v4 mode grouping. Drives which items the service estimator can quote. */
export type PricebookMode = "assembly_service" | "moving" | "junk_removal" | "surcharge_fee";

/** Safety crew classification from Pricebook v4 (1 / ⚠️2 / ⚠️3). */
export type PricebookCrewSize = 1 | 2 | 3;

export interface PricebookCategory {
  id: string;
  name: string;
  description: string;
  imageName?: string;
  mode?: PricebookMode;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PricebookItem {
  id: string;
  name: string;
  modelNumber?: string;
  price: number;
  cost: number;
  categoryId: string;
  itemType: PricebookItemType;
  description: string;
  imageName?: string;
  /** Safety classification — how many workers the job requires. */
  crewSize?: PricebookCrewSize;
  /** Target gross margin as a decimal (e.g. 0.52 for 52%). v4 lists margin, not cost. */
  marginDecimal?: number;
  /** How `price` is applied. Defaults to "flat". */
  priceUnit?: PricebookPriceUnit;
  /** Free-text price nuance v4 can't store as a single number (ranges, "+", "King: $119"). */
  priceNote?: string;
  /** v4 mode grouping; lets the service estimator filter quotable items. */
  mode?: PricebookMode;
  /** v4 "Notes" column ("Wall anchoring included", "NEVER solo"). */
  notes?: string;
  /**
   * Mandatory photo rule (Pricebook v4). True on all junk-removal and moving items.
   * When any photoRequired item is in an estimate, the estimator must show the
   * "Photos required before confirming final price with customer" reminder.
   */
  photoRequired?: boolean;
  addToOnlineBooking: boolean;
  taxable: boolean;
  createdAt: string;
  updatedAt: string;
}
