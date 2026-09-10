import { supabase, ensureSession } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

type Resource =
  | "jobs"
  | "saved_estimates"
  | "facilities"
  | "vehicles"
  | "material_pricing_rules"
  | "volume_benchmarks"
  | "pricing_defaults"
  | "pricebook_items"
  | "pricebook_categories"
  | "app_leads_v";
type Row<T extends Resource> = T extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][T]["Row"]
  : Record<string, any>;

/** Authorization and projections are enforced in SQL, never by the cached role. */
export async function businessRows<T extends Resource>(
  resource: T
): Promise<{ data: Row<T>[] | null; error: { message: string } | null }> {
  if (!supabase || !(await ensureSession()))
    return { data: null, error: { message: "Sign in required." } };
  const { data, error } = await (supabase as any).rpc("business_rows", {
    resource,
  });
  return { data: data as Row<T>[] | null, error };
}
