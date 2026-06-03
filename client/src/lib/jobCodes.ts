import type { MaterialCategory } from "@/types/pricing";

// Short codes for the dense Jobs table. The full name is always shown on hover
// (title attr), so these only need to be recognizable at a glance.

export const MATERIAL_CODE: Record<MaterialCategory, string> = {
  household_junk: "MSW",
  furniture: "FRN",
  appliances: "APP",
  mattresses: "MAT",
  tires: "TIR",
  mixed_c_and_d: "C&D",
  clean_concrete: "CON",
  clean_tile: "TIL",
  brick: "BRK",
  dirt: "DRT",
  rock: "RCK",
  sod: "SOD",
  stone: "STN",
  asphalt: "ASP",
  pavers: "PAV",
  heavy_clean_debris: "HCD",
  green_waste: "GWR",
  metal: "MTL",
  cardboard: "CBD",
  hazardous_excluded: "HAZ",
};

// Keyed by facility id (stable). Codes provided/approved by the user.
export const FACILITY_CODE: Record<string, string> = {
  "sky-harbor-transfer": "SKY",
  "deer-valley-transfer": "DVT",
  "weinberger-cooper-transfer": "WWD",
  "buesing-recycling": "BUE",
  "crm-tires": "CRM",
  "republic-germann-transfer": "RPG",
  "wm-san-tan-transfer": "SAN",
  "white-tank-transfer": "WTT",
  "butterfield-landfill": "BSL",
  "phoenix-27th-ave-transfer": "PHS",
  "phoenix-north-gateway-transfer": "PHN",
};

/** First letters of up to three words, e.g. "Acme Junk Co" -> "AJC". */
function deriveCode(text: string) {
  const words = text.replace(/[^a-zA-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  return words.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
}

export function materialCode(category?: MaterialCategory, fallbackName?: string) {
  if (category && MATERIAL_CODE[category]) return MATERIAL_CODE[category];
  if (fallbackName) return deriveCode(fallbackName);
  return "—";
}

export function facilityCode(id?: string, name?: string) {
  if (id && FACILITY_CODE[id]) return FACILITY_CODE[id];
  if (name) return deriveCode(name);
  return "—";
}
