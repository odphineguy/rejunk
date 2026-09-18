/**
 * Daily keep-alive ping for the Supabase project (rejunk-prod).
 *
 * Supabase pauses free-tier projects after 7 days without activity. The
 * webhook pipeline normally keeps rejunk-prod busy, but this cron is cheap
 * insurance: once a day it runs one tiny read so the project never counts as
 * idle. Scheduled in vercel.json (`crons`). Hobby plans allow one run per day.
 *
 * SELF-CONTAINED ON PURPOSE (Vercel api/ functions can't import ../server/*).
 * Env: SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 * If CRON_SECRET is set in the Vercel env, Vercel sends it as a Bearer token
 * and we reject any request that doesn't carry it.
 */

import { createClient } from "@supabase/supabase-js";

type Req = { method?: string; headers: Record<string, string | string[] | undefined> };
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers["authorization"];
    const header = Array.isArray(auth) ? auth[0] : auth;
    if (header !== `Bearer ${secret}`) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.status(503).json({ ok: false, error: "supabase env not configured" });
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase
    .from("app_settings")
    .select("key", { head: true, count: "exact" })
    .limit(1);

  if (error) {
    res.status(500).json({ ok: false, error: error.message });
    return;
  }
  res.status(200).json({ ok: true, pingedAt: new Date().toISOString() });
}
