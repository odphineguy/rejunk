import { build } from "esbuild";
import vm from "node:vm";
import assert from "node:assert/strict";
const bundled = await build({
  entryPoints: ["server/officeQuote.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  packages: "external",
});
const module = { exports: {} };
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
vm.runInNewContext(bundled.outputFiles[0].text, {
  module,
  exports: module.exports,
  require,
  console,
  process,
  Buffer,
  Date,
  Map,
  Set,
});
const { quoteForStaff } = module.exports;
const rows = {
  staff_sessions: { staff_id: "staff", expires_at: "2099-01-01" },
  staff: { id: "staff", role: "office", active: true },
  facilities: {
    id: "f",
    facility_name: "Test facility",
    facility_type: "landfill",
    accepted_materials: [],
    rejected_materials: [],
    price_type: "per_ton",
    default_rate: 60,
    minimum_charge: 40,
    environmental_fee: 5,
    fuel_surcharge: 0,
    extra_fees: [],
    hours: {},
    is_active: true,
  },
  vehicles: {
    id: "v",
    vehicle_name: "Test vehicle",
    vehicle_type: "cargo_van",
    usable_cubic_yards: 15,
    max_payload_lbs: 4000,
    mpg_unloaded: 12,
    mpg_loaded: 10,
    hourly_vehicle_cost: 20,
    mileage_cost: 1,
    is_active: true,
  },
  material_pricing_rules: {
    id: "m",
    material_name: "Junk",
    material_category: "mixed_junk",
    default_density_lbs_per_yard: 100,
    pricing_mode: "volume",
    preferred_facility_types: [],
    labor_difficulty_multiplier: 1,
    disposal_difficulty_multiplier: 1,
    is_active: true,
  },
  pricing_defaults: {
    id: 1,
    fuel_price_per_gallon: 4,
    workers: 2,
    hourly_labor_cost: 30,
    estimated_hours: 2,
    target_margin_decimal: 0.5,
    minimum_profit_dollars: 150,
    default_facility_rate_per_ton: 60,
  },
  volume_benchmarks: [{ id: "b", label: "Full", fraction: 1, price: 500 }],
};
const db = {
  rpc: async () => ({ data: "quote-id", error: null }),
  from(name) {
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle() {
        return Promise.resolve({ data: rows[name], error: null });
      },
      then(resolve) {
        return Promise.resolve({ data: rows[name], error: null }).then(resolve);
      },
    };
  },
};
const input = {
  token: "valid-token",
  facilityId: "f",
  vehicleId: "v",
  materialId: "m",
  cubicYards: 5,
  workers: 2,
  estimatedHours: 2,
  roundTripMiles: 20,
};
const result = await quoteForStaff(db, input);
assert.equal(result.status, 200);
assert.ok(result.body.quote.finalRecommendedQuote > 0);
for (const key of [
  "baseCost",
  "laborCost",
  "disposalCost",
  "fuelCost",
  "vehicleCost",
  "minimumQuote",
  "recommendedQuote",
  "grossProfitDollars",
  "grossMarginDecimal",
])
  assert.equal(key in result.body.quote, false, key);
assert.equal(
  (
    await quoteForStaff(db, {
      ...input,
      hourlyLaborCost: 0,
      targetMarginDecimal: 0,
      minimumProfitDollars: 0,
      facility: { default_rate: 0 },
    })
  ).body.quote.finalRecommendedQuote,
  result.body.quote.finalRecommendedQuote
);
assert.equal(
  (await quoteForStaff(db, { ...input, cubicYards: -1 })).status,
  400
);
assert.equal(
  (await quoteForStaff(db, { ...input, workers: Infinity })).status,
  400
);
rows.staff.role = "driver";
assert.equal((await quoteForStaff(db, input)).status, 403);
rows.staff.role = "office";
rows.staff.active = false;
assert.equal((await quoteForStaff(db, input)).status, 403);
rows.staff.active = true;
rows.staff_sessions.expires_at = "2000-01-01";
assert.equal((await quoteForStaff(db, input)).status, 401);
assert.equal((await quoteForStaff(db, {})).status, 401);
console.log(
  "PASS: server-owned pricing, output privacy, input bounds, role/deactivation/expiry checks"
);
