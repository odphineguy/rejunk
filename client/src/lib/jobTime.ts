import { ensureSession, supabase } from "@/lib/supabase";

// DRIVER_TIME_TRACKING_SPEC — crew taps (Start / Pause / Resume / Complete) are saved by
// `driver_update_job_status` into `job_time_events`. The browser never reads that table:
// these owner-only RPCs return the computed times (migration 20260925000001).

export interface JobTimeEvent {
  kind: "start" | "pause" | "resume" | "complete" | "reminder";
  source: "driver" | "owner" | "system";
  at: string;
  previousAt: string | null;
  employeeId: string | null;
  employeeName: string | null;
  staffEmail: string | null;
  note: string | null;
  createdAt: string;
}

export interface JobTime {
  jobId: string;
  startedAt: string | null;
  completedAt: string | null;
  pausedMinutes: number;
  /** Start → finish (or now, while running) minus paused time. */
  onJobMinutes: number | null;
  crewSize: number;
  /** Time on job × crew size; null until the job has both a start and a finish. */
  laborHours: number | null;
  events: JobTimeEvent[];
}

export interface LaborHoursSeries {
  /** First Phoenix day any tap was saved; weeks before it have no data. */
  trackingSince: string | null;
  days: Array<{ date: string; hours: number; jobs: number }>;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("The database isn't connected.");
  if (!(await ensureSession())) throw new Error("Sign in again to load job times.");
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function loadJobTime(jobId: string): Promise<JobTime> {
  return rpc<JobTime>("job_time_summary", { target_job_id: jobId });
}

/** Owner correction of the start or finish time. Logged with the old value. */
export function setJobTime(jobId: string, which: "start" | "complete", at: Date, reason: string): Promise<JobTime> {
  return rpc<JobTime>("owner_set_job_time", {
    target_job_id: jobId,
    which,
    at_time: at.toISOString(),
    reason,
  });
}

export function loadLaborHoursSeries(from: string, to: string): Promise<LaborHoursSeries> {
  return rpc<LaborHoursSeries>("labor_hours_series", { p_from: from, p_to: to });
}
