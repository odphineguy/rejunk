import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  calculateEstimate,
  findVolumeBenchmark,
} from "../client/src/utils/pricingCalculator";
import {
  facilityFromRow,
  vehicleFromRow,
  materialFromRow,
  defaultsFromRow,
} from "../shared/pricingRows";
import { defaultHeavyBedloadPricing } from "../client/src/data/defaultPricing";

function number(value: unknown, fallback: number, max: number) {
  if (value === undefined || value === "") return fallback;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    throw new Error("Invalid quote input.");
  return value;
}
export async function quoteForStaff(
  db: SupabaseClient,
  body: Record<string, unknown>
) {
  if (typeof body.token !== "string" || body.token.length > 256)
    return { status: 401, body: { error: "Sign in required." } };
  const { data: session, error: sessionError } = await db
    .from("staff_sessions")
    .select("staff_id,expires_at")
    .eq("token", body.token)
    .maybeSingle();
  if (
    sessionError ||
    !session ||
    new Date(session.expires_at).getTime() <= Date.now()
  )
    return { status: 401, body: { error: "Sign in required." } };
  const { data: staff, error: staffError } = await db
    .from("staff")
    .select("id,role,active")
    .eq("id", session.staff_id)
    .maybeSingle();
  if (staffError || !staff?.active || !["owner", "office"].includes(staff.role))
    return { status: 403, body: { error: "Office access required." } };
  if (
    ["facilityId", "vehicleId", "materialId"].some(
      key =>
        typeof body[key] !== "string" ||
        !(body[key] as string).length ||
        (body[key] as string).length > 200
    )
  ) {
    return {
      status: 400,
      body: { error: "Select a material, vehicle, and facility." },
    };
  }
  // IDs select trusted configuration; client-supplied costs/margins are ignored.
  const responses = await Promise.all([
    db
      .from("facilities")
      .select("*")
      .eq("id", body.facilityId)
      .eq("is_active", true)
      .maybeSingle(),
    db
      .from("vehicles")
      .select("*")
      .eq("id", body.vehicleId)
      .eq("is_active", true)
      .maybeSingle(),
    db
      .from("material_pricing_rules")
      .select("*")
      .eq("id", body.materialId)
      .eq("is_active", true)
      .maybeSingle(),
    db.from("pricing_defaults").select("*").eq("id", 1).maybeSingle(),
    db.from("volume_benchmarks").select("*"),
  ]);
  if (responses.some(r => r.error))
    return {
      status: 503,
      body: { error: "Quote settings could not be loaded." },
    };
  const [f, v, m, d, b] = responses.map(r => r.data);
  if (!f || !v || !m || !d)
    return {
      status: 400,
      body: { error: "Select an active material, vehicle, and facility." },
    };
  try {
    const defaults = defaultsFromRow(d as any);
    const loadFraction = number(body.loadFraction, 1, 10);
    const result = calculateEstimate({
      materialRule: materialFromRow(m as any),
      vehicle: vehicleFromRow(v as any),
      facility: facilityFromRow(f as any),
      loadFraction,
      cubicYards:
        body.cubicYards === undefined
          ? undefined
          : number(body.cubicYards, 0, 1000),
      manualWeightLbs:
        body.manualWeightLbs === undefined
          ? undefined
          : number(body.manualWeightLbs, 0, 200000),
      workers: number(body.workers, defaults.workers, 50),
      estimatedHours: number(body.estimatedHours, defaults.estimatedHours, 200),
      roundTripMiles: number(body.roundTripMiles, 0, 5000),
      hourlyLaborCost: defaults.hourlyLaborCost,
      fuelPricePerGallon: defaults.fuelPricePerGallon,
      targetMarginDecimal: defaults.targetMarginDecimal,
      minimumProfitDollars: defaults.minimumProfitDollars,
      volumeBenchmarkPrice: findVolumeBenchmark(b as any, loadFraction)?.price,
      heavyBedloadPricing: defaultHeavyBedloadPricing,
      extraFees: [],
    });
    const { data: quoteId, error: quoteError } = await db.rpc(
      "store_office_quote",
      { staff_id: staff.id, quote_data: result }
    );
    if (quoteError || typeof quoteId !== "string")
      return {
        status: 503,
        body: { error: "Quote could not be saved securely." },
      };
    // Never return component costs, pricing floors derived from profit, or margins.
    return {
      status: 200,
      body: {
        quote: {
          quoteId,
          cubicYards: result.cubicYards,
          estimatedWeightLbs: result.estimatedWeightLbs,
          estimatedTons: result.estimatedTons,
          finalRecommendedQuote: result.finalRecommendedQuote,
          payloadStatus: result.payloadStatus,
          warnings: result.warnings.filter(
            w => w.code !== "margin_below_target"
          ),
          heavyBedload: result.heavyBedload,
        },
      },
    };
  } catch {
    return { status: 400, body: { error: "Invalid quote input." } };
  }
}
export async function handleOfficeQuote(body: unknown) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return { status: 503, body: { error: "Quote service is not configured." } };
  return quoteForStaff(
    createClient(url, key, { auth: { persistSession: false } }),
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  );
}
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Use POST." });
  try {
    const result = await handleOfficeQuote(req.body);
    return res.status(result.status).json(result.body);
  } catch {
    return res.status(503).json({ error: "Quote service unavailable." });
  }
}
