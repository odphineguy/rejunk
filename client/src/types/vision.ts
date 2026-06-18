// Types for the photo-based "Vision" estimator (Build 2). The analysis result
// mirrors the JSON the System Instructions prompt asks the AI to return; the
// settings are the editable, business-level config that lives in the Estimate
// Settings → Vision AI card.

/** One line in the AI's item breakdown. cubicYards/weight are TOTALS for the
 * whole line (all `quantity` units), matching how the reference UI displays
 * them (e.g. "5 boxes · 0.4 yd³ · 20 lbs"). */
export interface VisionItem {
  item: string;
  quantity: number;
  cubicYards: number;
  weight: number;
}

export interface VisionScrapItem {
  type: string;
  estimatedWeight: number;
}

export interface VisionDetectedFee {
  name: string;
  quantity: number;
  totalPrice: number;
}

export interface VisionAnalysisResult {
  cubicYards: number;
  estimatedWeight: number;
  confidence: number;
  itemBreakdown: VisionItem[];
  detectedExtraFees: VisionDetectedFee[];
  scrapMetalItems: VisionScrapItem[];
  scrapMetalTotalWeight: number;
  analysis: string;
}

/** Editable AI config, persisted via settingsStorage("vision") (localStorage +
 * Supabase app_settings). Seeded from `defaultVisionSettings`. */
export interface VisionSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  systemInstructions: string;
  /** Prompt for the (deferred) Tetris / packing visual. Stored, not yet used. */
  visualBreakdownInstructions: string;
}
