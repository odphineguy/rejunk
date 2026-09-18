import type {
  PricebookCategory,
  PricebookItem,
  PricebookItemType,
  PricebookMode,
  PricebookCrewSize,
  PricebookPriceUnit,
} from "@/types/pricebook";

/**
 * Seed catalog transcribed from rejunk-pricebook-v4.md (June 8, 2026).
 * This is the authoritative Pricebook — the source the service estimator and (later)
 * the Thumbtack auto-quote engine read from. Margins/crew/photo rules come straight
 * from v4. Hard rules baked in here: assembly/handyman floor is $125 (v4 supersedes
 * v3's $99); every junk-removal and moving item is photoRequired.
 */

const NOW = "2026-06-08T00:00:00.000Z";

type SeedItem = {
  id: string;
  name: string;
  price: number;
  marginDecimal?: number;
  crewSize?: PricebookCrewSize;
  priceUnit?: PricebookPriceUnit;
  priceNote?: string;
  notes?: string;
  itemType?: PricebookItemType;
  description?: string;
  photoRequired?: boolean;
  taxable?: boolean;
};

function mk(it: SeedItem, categoryId: string, mode: PricebookMode, photoDefault: boolean): PricebookItem {
  const itemType = it.itemType ?? "Service";
  const cost =
    it.marginDecimal != null ? Math.round(it.price * (1 - it.marginDecimal)) : 0;
  return {
    id: it.id,
    name: it.name,
    price: it.price,
    cost,
    categoryId,
    itemType,
    description: it.description ?? "",
    crewSize: it.crewSize,
    marginDecimal: it.marginDecimal,
    priceUnit: it.priceUnit ?? "flat",
    priceNote: it.priceNote,
    mode,
    notes: it.notes,
    photoRequired: it.photoRequired ?? photoDefault,
    addToOnlineBooking: false,
    taxable: it.taxable ?? itemType !== "Fee",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

type SeedGroup = {
  category: Omit<PricebookCategory, "createdAt" | "updatedAt">;
  photoDefault: boolean;
  items: SeedItem[];
};

const GROUPS: SeedGroup[] = [
  // ───────────────────────── Mode 1 — Assembly & Service ─────────────────────────
  {
    category: {
      id: "cat-assembly",
      name: "Furniture Assembly",
      description: "Flat-rate furniture assembly. $125 minimum service call, $95/hr overflow, 1 worker + van default.",
      mode: "assembly_service",
      sortOrder: 10,
    },
    photoDefault: false,
    items: [
      { id: "assembly-min-service-call", name: "Minimum Service Call", price: 125, marginDecimal: 0.52, crewSize: 1, notes: "Covers drive + up to 1 hr on-site. Non-negotiable floor." },
      { id: "assembly-additional-hour", name: "Additional Hour", price: 95, priceUnit: "hourly", marginDecimal: 0.58, crewSize: 1, notes: "On-site, no additional drive cost." },
      { id: "assembly-dining-chair", name: "Dining Chair (each)", price: 35, priceUnit: "per_item", marginDecimal: 0.43, crewSize: 1, notes: "3+ chairs same visit = $99 bundle." },
      { id: "assembly-office-chair", name: "Office Chair (each)", price: 45, priceUnit: "per_item", marginDecimal: 0.56, crewSize: 1 },
      { id: "assembly-small-table-nightstand", name: "Small Table / Nightstand", price: 65, marginDecimal: 0.48, crewSize: 1, notes: "Still subject to $125 minimum service call." },
      { id: "assembly-bookshelf-under-5ft", name: "Bookshelf (under 5 ft)", price: 99, marginDecimal: 0.5, crewSize: 1, notes: "Wall anchoring included." },
      { id: "assembly-bookshelf-5ft-plus", name: "Bookshelf (5 ft+)", price: 125, marginDecimal: 0.56, crewSize: 1, notes: "Tall unit. Wall anchoring included." },
      { id: "assembly-tv-stand", name: "TV Stand / Media Console", price: 125, marginDecimal: 0.56, crewSize: 1 },
      { id: "assembly-entertainment-center", name: "Entertainment Center", price: 150, marginDecimal: 0.6, crewSize: 1, notes: "Multi-section unit." },
      { id: "assembly-desk-standard", name: "Desk (standard)", price: 125, marginDecimal: 0.56, crewSize: 1 },
      { id: "assembly-desk-l-shaped", name: "Desk (L-shaped / executive)", price: 175, marginDecimal: 0.6, crewSize: 1, notes: "Multi-section with hutch." },
      { id: "assembly-dresser-3-6", name: "Dresser (3-6 drawer)", price: 150, marginDecimal: 0.6, crewSize: 1 },
      { id: "assembly-dresser-7-plus", name: "Dresser (7+ drawer)", price: 175, marginDecimal: 0.6, crewSize: 1, notes: "Large dresser. Wall anchor included." },
      { id: "assembly-bed-frame-platform", name: "Bed Frame (basic platform)", price: 125, marginDecimal: 0.56, crewSize: 1 },
      { id: "assembly-bed-frame-headboard", name: "Bed Frame (w/ headboard)", price: 175, marginDecimal: 0.6, crewSize: 1 },
      { id: "assembly-bed-frame-storage", name: "Bed Frame (storage/hydraulic)", price: 199, marginDecimal: 0.6, crewSize: 1, notes: "Under-bed storage or lift mechanism." },
      { id: "assembly-bunk-bed", name: "Bunk Bed", price: 350, marginDecimal: 0.58, crewSize: 2, notes: "2 workers required." },
      { id: "assembly-murphy-bed", name: "Murphy Bed / Wall Bed", price: 450, marginDecimal: 0.5, crewSize: 2, notes: "2 workers. Wall mounting, complex." },
      { id: "assembly-dining-table-standard", name: "Dining Table (standard)", price: 125, marginDecimal: 0.56, crewSize: 1, notes: "4-6 person table." },
      { id: "assembly-dining-table-large", name: "Dining Table (large 8+)", price: 275, marginDecimal: 0.46, crewSize: 2, notes: "2 workers if over 100 lbs." },
      { id: "assembly-wardrobe-armoire", name: "Wardrobe / Armoire", price: 275, marginDecimal: 0.46, crewSize: 2, notes: "2 workers to stand upright." },
      { id: "assembly-outdoor-furniture", name: "Outdoor Furniture Set", price: 149, marginDecimal: 0.53, crewSize: 1, notes: "Table + 4 chairs." },
      { id: "assembly-shelving-system", name: "Shelving / Storage System", price: 225, marginDecimal: 0.56, crewSize: 1, notes: "Large wall units." },
      { id: "assembly-ikea-small", name: "IKEA Small Project", price: 149, marginDecimal: 0.52, crewSize: 1, notes: "Standard single-item IKEA builds." },
      { id: "assembly-ikea-large", name: "IKEA Large Project", price: 399, marginDecimal: 0.6, crewSize: 2, notes: "Multi-piece or complex IKEA builds." },
      { id: "assembly-multi-item-discount", name: "Multi-Item Discount (4+)", price: 10, priceUnit: "percent", priceNote: "−10%", itemType: "Fee", notes: "Applied to total when 4+ items in a single visit." },
    ],
  },
  {
    category: {
      id: "cat-equipment-assembly",
      name: "Equipment & Outdoor",
      description: "Fitness, play, and outdoor equipment assembly. Overhead/heavy items require 2 workers.",
      mode: "assembly_service",
      sortOrder: 20,
    },
    photoDefault: false,
    items: [
      { id: "equip-treadmill", name: "Treadmill", price: 149, marginDecimal: 0.6, crewSize: 1, notes: "Unbox, assemble, level." },
      { id: "equip-elliptical-bike", name: "Elliptical / Stationary Bike", price: 129, marginDecimal: 0.54, crewSize: 1, notes: "Standard home cardio." },
      { id: "equip-home-gym", name: "Home Gym / Multi-Station", price: 450, marginDecimal: 0.5, crewSize: 2, notes: "Complex. 2 workers." },
      { id: "equip-trampoline", name: "Trampoline (12-15 ft)", price: 299, marginDecimal: 0.51, crewSize: 2, notes: "2 workers — spring tensioning." },
      { id: "equip-playset", name: "Playset / Jungle Gym", price: 449, marginDecimal: 0.5, crewSize: 2 },
      { id: "equip-bball-portable", name: "Basketball Hoop (portable)", price: 275, marginDecimal: 0.46, crewSize: 2, notes: "Heavy base." },
      { id: "equip-bball-inground", name: "Basketball Hoop (in-ground)", price: 499, priceNote: "$499+", marginDecimal: 0.55, crewSize: 2, notes: "Concrete setting may be separate." },
      { id: "equip-bbq-gas", name: "BBQ / Grill (gas, assembly)", price: 199, marginDecimal: 0.6, crewSize: 1, notes: "NO gas line work." },
      { id: "equip-bbq-tuneup", name: "BBQ Grill Tune-Up", price: 199, marginDecimal: 0.6, crewSize: 1, notes: "Cleaning / maintenance." },
      { id: "equip-bbq-premium", name: "BBQ / Grill (premium/built-in)", price: 349, marginDecimal: 0.49, crewSize: 2, notes: "2 workers if >150 lbs." },
      { id: "equip-patio-cover", name: "Patio Cover / Canopy", price: 299, marginDecimal: 0.51, crewSize: 2, notes: "2 workers — overhead work." },
      { id: "equip-swing-set", name: "Swing Set (wood)", price: 549, marginDecimal: 0.5, crewSize: 2, notes: "Large structure." },
      { id: "equip-gazebo", name: "Gazebo / Pergola Kit (10×10)", price: 649, marginDecimal: 0.5, crewSize: 2, notes: "2 workers minimum." },
      { id: "equip-shed-kit", name: "Shed (pre-fab kit, small)", price: 449, marginDecimal: 0.5, crewSize: 2, notes: "Small 6×8 or 8×10." },
      { id: "equip-smart-home", name: "Smart Home Device Setup", price: 125, marginDecimal: 0.52, crewSize: 1, notes: "Thermostat, doorbell, etc." },
    ],
  },
  {
    category: {
      id: "cat-handyman",
      name: "Handyman Services",
      description: "$125 minimum service call, $95/hr overflow ($160/hr for a 2-person crew).",
      mode: "assembly_service",
      sortOrder: 30,
    },
    photoDefault: false,
    items: [
      { id: "handyman-min-service-call", name: "Minimum Service Call", price: 125, marginDecimal: 0.52, crewSize: 1, notes: "Covers drive + up to 1 hr." },
      { id: "handyman-hourly", name: "Hourly Rate", price: 95, priceUnit: "hourly", marginDecimal: 0.58, crewSize: 1, notes: "After first hour." },
      { id: "handyman-hourly-2person", name: "Two-Person Crew Hourly", price: 160, priceUnit: "hourly", marginDecimal: 0.52, crewSize: 2 },
      { id: "handyman-picture-1-3", name: "Picture Hanging (1-3)", price: 85, marginDecimal: 0.42, crewSize: 1, notes: "Stud-finding, level hanging." },
      { id: "handyman-picture-4-8", name: "Picture Hanging (4-8)", price: 149, marginDecimal: 0.46, crewSize: 1, notes: "Gallery walls, multiple rooms." },
      { id: "handyman-tv-under-55", name: 'TV Mounting (under 55")', price: 129, marginDecimal: 0.53, crewSize: 1, notes: "Mount NOT provided." },
      { id: "handyman-tv-55-65", name: 'TV Mounting (55-65")', price: 199, marginDecimal: 0.6, crewSize: 1 },
      { id: "handyman-tv-75-plus", name: 'TV Mounting (75"+)', price: 249, marginDecimal: 0.41, crewSize: 2, notes: "2 workers — too heavy solo." },
      { id: "handyman-cord-concealment", name: "Cord Concealment (in-wall)", price: 75, marginDecimal: 0.47, crewSize: 1, notes: "Add-on to TV mounting." },
      { id: "handyman-curtain-rod", name: "Curtain Rod (each)", price: 99, priceUnit: "per_item", marginDecimal: 0.64, crewSize: 1 },
      { id: "handyman-blinds", name: "Blinds Installation", price: 125, marginDecimal: 0.56, crewSize: 1 },
      { id: "handyman-floating-shelf", name: "Shelf Install (floating, each)", price: 99, priceUnit: "per_item", marginDecimal: 0.64, crewSize: 1 },
      { id: "handyman-mirror", name: "Mirror Hanging", price: 125, marginDecimal: 0.56, crewSize: 1 },
      { id: "handyman-grab-bar", name: "Grab Bar Install", price: 125, marginDecimal: 0.56, crewSize: 1 },
      { id: "handyman-baby-gate", name: "Baby Gate Install", price: 99, marginDecimal: 0.52, crewSize: 1 },
      { id: "handyman-garbage-disposal", name: "Garbage Disposal Install", price: 139, marginDecimal: 0.57, crewSize: 1, notes: "Labor only. Customer provides unit." },
      { id: "handyman-minor-repair", name: "Minor Repair (general)", price: 95, priceUnit: "hourly", marginDecimal: 0.58, crewSize: 1, notes: "Door adjustments, drywall, hardware." },
    ],
  },
  {
    category: {
      id: "cat-appliance",
      name: "Appliance Services",
      description: "Appliance delivery, placement, and relocation. All jobs require 2 workers.",
      mode: "assembly_service",
      sortOrder: 40,
    },
    photoDefault: false,
    items: [
      { id: "appliance-delivery-placement", name: "Delivery & Placement (local)", price: 249, marginDecimal: 0.41, crewSize: 2, notes: "Liftgate included." },
      { id: "appliance-fridge-relocation", name: "Refrigerator Relocation", price: 249, marginDecimal: 0.41, crewSize: 2, notes: "Loading, transport, placement." },
      { id: "appliance-washer-dryer", name: "Washer/Dryer Delivery (each)", price: 249, priceUnit: "per_item", marginDecimal: 0.41, crewSize: 2, notes: "Hookup NOT included." },
      { id: "appliance-stove-oven", name: "Stove/Oven Delivery", price: 249, marginDecimal: 0.41, crewSize: 2, notes: "Gas hookup NOT included." },
      { id: "appliance-dishwasher", name: "Dishwasher Placement", price: 199, marginDecimal: 0.41, crewSize: 2, notes: "Cabinet placement only." },
      { id: "appliance-removal", name: "Appliance Removal (haul away)", price: 149, marginDecimal: 0.46, crewSize: 2, notes: "Refrigerant: +$20 facility fee." },
      { id: "appliance-unpack-place", name: "Equipment Unpack & Place", price: 249, marginDecimal: 0.41, crewSize: 2, notes: "Unbox, position, remove packing." },
    ],
  },
  {
    category: {
      id: "cat-cleaning",
      name: "Cleaning & Property Services",
      description: "Deep cleans, yard cleanup, pressure washing. Scope varies — quote after photos.",
      mode: "assembly_service",
      sortOrder: 50,
    },
    photoDefault: false,
    items: [
      { id: "cleaning-deep-clean", name: "Deep Clean", price: 275, marginDecimal: 0.55, crewSize: 1, notes: "1-2 workers. Scope varies — quote after photos." },
      { id: "cleaning-yard-cleanup", name: "Yard Cleanup", price: 250, marginDecimal: 0.55, crewSize: 1, notes: "1-2 workers. Debris removal, general cleanup." },
      { id: "cleaning-pressure-washing", name: "Pressure Washing", price: 250, marginDecimal: 0.55, crewSize: 1, notes: "Driveways, patios, walkways." },
    ],
  },

  // ───────────────────────── Mode 2 — Moving & Delivery ─────────────────────────
  // Pricing v19 (Sep 6, 2026) — mirrors data/movingRates.ts. The moving quote
  // engine reads movingRates.ts, not these rows; they exist so a fresh seed of
  // the Pricebook page is never wrong. Weekend = Fri/Sat/Sun + first two and
  // last two days of any month (Phoenix time).
  {
    category: {
      id: "cat-moving",
      name: "Moving — Flat Packages",
      description: "v19 flat packages: movers, 26-ft liftgate truck, blankets, shrink wrap, disassembly/reassembly, travel, and the first flight of stairs at each address. Extra time $109/hr weekday, $124/hr weekend. ALWAYS ask about stairs and request photos.",
      mode: "moving",
      sortOrder: 60,
    },
    photoDefault: true,
    items: [
      { id: "moving-small-move", name: "Small Move — Up to 8 Items, No Full Rooms (Weekday)", price: 303, crewSize: 2, notes: "2 movers + truck. First 2 hrs + travel included." },
      { id: "moving-small-move-weekend", name: "Small Move — Up to 8 Items, No Full Rooms (Weekend)", price: 333, crewSize: 2, notes: "2 movers + truck. First 2 hrs + travel included." },
      { id: "moving-apartment-studio-1br", name: "Apartment Move — Studio/1BR (Weekday)", price: 525, crewSize: 2, notes: "4 on-site hrs included, then $109/hr." },
      { id: "moving-apartment-studio-1br-weekend", name: "Apartment Move — Studio/1BR (Weekend)", price: 595, crewSize: 2, notes: "4 on-site hrs included, then $124/hr." },
      { id: "moving-apartment-2br", name: "Apartment Move — 2BR (Weekday)", price: 750, crewSize: 3, notes: "6 on-site hrs included, then $109/hr. Never say 2 movers." },
      { id: "moving-apartment-2br-weekend", name: "Apartment Move — 2BR (Weekend)", price: 850, crewSize: 3, notes: "6 on-site hrs included, then $124/hr." },
      { id: "moving-home-small-house", name: "Home Move — Small House, up to 3BR (Weekday)", price: 750, crewSize: 3, notes: "Single level or one flight. 6 on-site hrs included, then $109/hr." },
      { id: "moving-home-small-house-weekend", name: "Home Move — Small House, up to 3BR (Weekend)", price: 850, crewSize: 3, notes: "Single level or one flight. 6 on-site hrs included, then $124/hr." },
      { id: "moving-additional-flight", name: "Additional Flight of Stairs (per flight, per address)", price: 75, priceUnit: "per_item", notes: "Packages only — first flight per address included." },
      { id: "moving-labor-only", name: "Labor Only — 2 Movers, 2-hr minimum (Weekday)", price: 218, crewSize: 2, notes: "No truck, no trip charge. $109/hr. Full payment at booking." },
      { id: "moving-labor-only-weekend", name: "Labor Only — 2 Movers, 2-hr minimum (Weekend)", price: 248, crewSize: 2, notes: "No truck, no trip charge. $124/hr." },
      { id: "moving-furniture-rearranging", name: "Furniture Rearranging (same building)", price: 149, crewSize: 1, notes: "1-2 workers. On-site repositioning." },
      { id: "moving-pod-storage", name: "Load/Unload POD or Storage", price: 250, crewSize: 2, notes: "Starting price." },
    ],
  },
  {
    category: {
      id: "cat-moving-hourly",
      name: "Moving — Hourly Rates",
      description: "v19 hourly: 2 movers + 26-ft liftgate truck $109/hr weekday, $124/hr weekend; +$50/hr per extra mover. 2-hour minimum (4 hours with 4 movers). 3BR+ / large house = 4 movers.",
      mode: "moving",
      sortOrder: 70,
    },
    photoDefault: true,
    items: [
      { id: "moving-hourly-2box", name: "2 Movers + 26-ft Truck (Weekday)", price: 109, priceUnit: "hourly", crewSize: 2, notes: "2-hr minimum. Trip fee baked in." },
      { id: "moving-hourly-2box-weekend", name: "2 Movers + 26-ft Truck (Weekend)", price: 124, priceUnit: "hourly", crewSize: 2, notes: "2-hr minimum. Trip fee baked in." },
      { id: "moving-additional-mover", name: "Additional Mover (per hour)", price: 50, priceUnit: "hourly", notes: "3 movers $159/$174 · 4 movers $209/$224 (4-hr minimum)." },
      { id: "moving-packing-labor", name: "Packing Labor — 2 packers, per hour (Weekday)", price: 109, priceUnit: "hourly", crewSize: 2, notes: "Usually a separate day before the move. 8–12 boxes per packer-hour." },
      { id: "moving-packing-labor-weekend", name: "Packing Labor — 2 packers, per hour (Weekend)", price: 124, priceUnit: "hourly", crewSize: 2, notes: "Usually a separate day before the move." },
      { id: "moving-packing-materials", name: "Packing Materials (per box, all-in)", price: 5, priceUnit: "per_item", itemType: "Product", notes: "Box + paper + tape. Dish pack / wardrobe cost more — owner adjusts." },
    ],
  },
  {
    category: {
      id: "cat-moving-travel",
      name: "Moving — Travel & Vans",
      description: "The $85 trip fee is baked into every truck-job total and never itemized — customers hear \"travel included\". Extended travel (over 50 miles between addresses) is the only travel line ever shown.",
      mode: "moving",
      sortOrder: 80,
    },
    photoDefault: true,
    items: [
      { id: "moving-trip-fee", name: "Trip Fee (truck jobs, baked in)", price: 85, itemType: "Fee", notes: "Never itemized to the customer. $0 on labor-only." },
      { id: "moving-extended-travel-75", name: "Extended Travel — 51–75 mi", price: 150, itemType: "Fee", notes: "Address-to-address miles. Shown as \"extended travel charge\"." },
      { id: "moving-extended-travel-100", name: "Extended Travel — 76–100 mi", price: 300, itemType: "Fee", notes: "Over 100 mi: manual price." },
      { id: "moving-van-flat", name: "Cargo Van Flat — Single Large Item", price: 199, crewSize: 1, notes: "≤15 mi between addresses. Excludes appliances, power recliners, exercise equipment, >150 lb, safes." },
      { id: "moving-cargo-van-small", name: "Cargo Van Small-Item Delivery (1 person)", price: 120, crewSize: 1, notes: "No trip fee." },
      { id: "moving-second-truck", name: "Second Truck (manual price)", price: 0, priceNote: "Manual", notes: "Owner sets the price per job." },
      { id: "moving-liftgate", name: "Liftgate Service", price: 0, itemType: "Fee", priceNote: "Included", notes: "Always mention: 'Our truck has a hydraulic liftgate at no extra charge.'" },
    ],
  },
  {
    category: {
      id: "cat-moving-specialty",
      name: "Specialty Items",
      description: "v19 piano tiers are flat and added on top of the move; +$75 per location with stairs / difficult access. Safes, hot tubs, and >300 lb non-piano items ESCALATE — never auto-price.",
      mode: "moving",
      sortOrder: 90,
    },
    photoDefault: true,
    items: [
      { id: "specialty-piano-upright", name: "Piano — Upright", price: 299, crewSize: 2, notes: "Flat tier, added on top of the move." },
      { id: "specialty-piano-large-upright", name: "Piano — Large Upright (48\"+)", price: 349, crewSize: 2, notes: "Flat tier, added on top of the move." },
      { id: "specialty-piano-baby-grand", name: "Piano — Baby Grand", price: 399, crewSize: 3, notes: "Flat tier, added on top of the move." },
      { id: "specialty-piano-grand", name: "Piano — Grand", price: 499, crewSize: 3, notes: "Flat tier, added on top of the move." },
      { id: "specialty-piano-stairs", name: "Piano — Stairs / Difficult Access (per location)", price: 75, priceUnit: "per_item", notes: "Escalate if >2 flights, crane, balcony, spiral." },
      { id: "specialty-play-structure", name: "Large Play Structure — Disassemble + Reassemble", price: 499, crewSize: 2, notes: "Wooden playset / swing set. Default flat; or labor-only hourly. Never move-day hours." },
      { id: "specialty-safe-basic", name: "Safe Moving — Basic", price: 300, crewSize: 3, notes: "ESCALATE — final price by weight/access; never auto-quote." },
      { id: "specialty-hot-tub-relocation", name: "Hot Tub Relocation", price: 895, crewSize: 3, notes: "ESCALATE. No electrical/plumbing disconnect." },
    ],
  },

  // ───────────────────────── Mode 3 — Junk Removal ─────────────────────────
  {
    category: {
      id: "cat-junk-volume",
      name: "Junk Removal — Volume",
      description: "Volume pricing is VEHICLE-AWARE (standard ~15 yd³ truck). For the 26-ft box truck, use the Rejunk estimator. ALWAYS request photos.",
      mode: "junk_removal",
      sortOrder: 100,
    },
    photoDefault: true,
    items: [
      { id: "junk-vol-1-8", name: "1/8 Truck Load", price: 129, notes: "Minimum." },
      { id: "junk-vol-1-4", name: "1/4 Truck Load", price: 175 },
      { id: "junk-vol-1-2", name: "1/2 Truck Load", price: 299 },
      { id: "junk-vol-3-4", name: "3/4 Truck Load", price: 399 },
      { id: "junk-vol-full", name: "Full Truck Load", price: 499, notes: "Standard junk truck (~15 yd³)." },
      { id: "junk-vol-4-plus-pickups", name: "4+ pickup trucks worth", price: 1556, priceNote: "$1,556+", notes: "Custom quote. Photos required." },
    ],
  },
  {
    category: {
      id: "cat-junk-items",
      name: "Junk Removal — Single Items",
      description: "Per-item junk removal pricing.",
      mode: "junk_removal",
      sortOrder: 110,
    },
    photoDefault: true,
    items: [
      { id: "junk-mattress", name: "Mattress / Box Spring", price: 99, priceNote: "King: $119", marginDecimal: 0.44, crewSize: 1, notes: "Per unit." },
      { id: "junk-sofa", name: "Sofa / Couch", price: 119, marginDecimal: 0.5, crewSize: 1, notes: "Standard couch." },
      { id: "junk-sectional", name: "Sectional Sofa", price: 299, marginDecimal: 0.51, crewSize: 2, notes: "NEVER solo." },
      { id: "junk-appliance-removal", name: "Appliance Removal", price: 149, marginDecimal: 0.46, crewSize: 2, notes: "Refrigerant: +$20." },
      { id: "junk-ewaste", name: "E-Waste (TV, monitors)", price: 69, marginDecimal: 0.42, crewSize: 1, notes: "Recycling center." },
      { id: "junk-tire", name: "Tire Disposal (per tire)", price: 20, priceUnit: "per_item", marginDecimal: 0.5, crewSize: 1 },
    ],
  },
  {
    category: {
      id: "cat-junk-demo",
      name: "Demo & Specialty Junk",
      description: "Light demolition and specialty junk removal.",
      mode: "junk_removal",
      sortOrder: 120,
    },
    photoDefault: true,
    items: [
      { id: "junk-demo-hot-tub", name: "Hot Tub Removal", price: 650, marginDecimal: 0.64, crewSize: 2 },
      { id: "junk-demo-shed", name: "Shed Demolition & Removal", price: 950, marginDecimal: 0.7, crewSize: 2, notes: "Higher margin — complex work." },
      { id: "junk-demo-yard-debris", name: "Yard Debris Removal", price: 199, marginDecimal: 0.55, crewSize: 1, notes: "1-2 workers." },
      { id: "junk-demo-construction", name: "Construction Debris Removal", price: 275, marginDecimal: 0.51, crewSize: 2, notes: "Light C&D. NOT concrete/brick." },
      { id: "junk-demo-tile-concrete", name: "Tile/Concrete Surcharge", price: 125, priceNote: "+$125", itemType: "Fee", crewSize: 2, notes: "Add-on for heavy materials." },
    ],
  },

  // ───────────────────────── Surcharges & Fees ─────────────────────────
  {
    category: {
      id: "cat-surcharges",
      name: "Surcharges",
      description: "Stairs, long carry, rush, weekend, materials runs, packing, extra stops.",
      mode: "surcharge_fee",
      sortOrder: 130,
    },
    photoDefault: false,
    items: [
      { id: "surcharge-stairs-2nd", name: "Stairs — 2nd floor", price: 100, priceNote: "+$100", itemType: "Fee", notes: "Per move direction." },
      { id: "surcharge-stairs-3rd", name: "Stairs — 3rd floor", price: 200, priceNote: "+$200", itemType: "Fee", notes: "Per move direction." },
      { id: "surcharge-stairs-above-3rd", name: "Stairs — above 3rd floor", price: 300, priceNote: "+$300", itemType: "Fee", notes: "Per move direction." },
      { id: "surcharge-long-carry", name: "Long Carry (50+ ft)", price: 40, priceNote: "+$40", itemType: "Fee", notes: "Truck can't park within 50 ft." },
      { id: "surcharge-same-day-rush", name: "Same-Day Rush", price: 75, priceNote: "+$75", itemType: "Fee", notes: "Booked and completed same day." },
      { id: "surcharge-weekend", name: "Weekend Add-On", price: 100, priceNote: "+$100", itemType: "Fee", notes: "Flat fee." },
      { id: "surcharge-materials-run", name: "Materials Run", price: 65, priceNote: "+$65", itemType: "Fee", notes: "Worker picks up supplies the customer needs." },
      { id: "surcharge-packing", name: "Packing Service (per hr)", price: 75, priceUnit: "hourly", itemType: "Fee", notes: "1 worker. Supplies included, boxes extra." },
      { id: "surcharge-extra-stop", name: "Extra Stop / Destination", price: 75, itemType: "Fee", notes: "MANDATORY for any scope addition with a separate address." },
    ],
  },
  {
    category: {
      id: "cat-overages",
      name: "Overages",
      description: "Applied automatically when a job exceeds quoted time, load, or scope.",
      mode: "surcharge_fee",
      sortOrder: 140,
    },
    photoDefault: false,
    items: [
      { id: "overage-extra-hour-1", name: "Extra Hour (1 worker)", price: 95, priceUnit: "hourly", itemType: "Fee" },
      { id: "overage-extra-hour-2", name: "Extra Hour (2 workers)", price: 160, priceUnit: "hourly", itemType: "Fee" },
      { id: "overage-extra-load", name: "Extra Load / Trip", price: 175, itemType: "Fee", notes: "Additional vehicle run + disposal." },
      { id: "overage-added-destination", name: "Added Destination", price: 75, itemType: "Fee", notes: "New stop not in original scope." },
    ],
  },
  {
    category: {
      id: "cat-fees",
      name: "Fees",
      description: "Processing, cancellation, special-handling, and disassembly fees.",
      mode: "surcharge_fee",
      sortOrder: 150,
    },
    photoDefault: false,
    items: [
      { id: "fee-scope-change", name: "Scope Change Re-Quote", price: 0, itemType: "Fee", notes: "PROCESS TRIGGER — re-quote before any added work." },
      { id: "fee-cancellation", name: "Cancellation (day-of)", price: 50, itemType: "Fee", notes: "Lost schedule slot." },
      { id: "fee-no-show", name: "No-Show / Locked Out", price: 50, itemType: "Fee", notes: "Crew arrives, no access." },
      { id: "fee-wait-time", name: "Excessive Wait Time", price: 40, priceUnit: "per_30min", itemType: "Fee", notes: "After 15-min grace period." },
      { id: "fee-hazardous", name: "Hazardous Discovery", price: 50, priceNote: "$50+", itemType: "Fee", notes: "Mold, waste, structural. May trigger refusal." },
      { id: "fee-credit-card", name: "Credit Card Processing", price: 3, priceUnit: "percent", priceNote: "3%", itemType: "Fee", notes: "Pass-through. Cash/Zelle: no fee." },
      { id: "fee-bed-bugs", name: "Bed Bugs", price: 300, itemType: "Fee", notes: "Special handling surcharge." },
      { id: "fee-drug-paraphernalia", name: "Drug Paraphernalia", price: 75, itemType: "Fee", notes: "Special handling surcharge." },
      { id: "fee-disassemble", name: "Disassemble Item", price: 35, priceUnit: "per_item", itemType: "Fee", notes: "Per item." },
    ],
  },
];

export const defaultPricebookCategories: PricebookCategory[] = GROUPS.map((g) => ({
  ...g.category,
  createdAt: NOW,
  updatedAt: NOW,
}));

export const defaultPricebookItems: PricebookItem[] = GROUPS.flatMap((g) =>
  g.items.map((it) => mk(it, g.category.id, g.category.mode ?? "assembly_service", g.photoDefault)),
);
