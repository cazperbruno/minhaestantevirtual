// deno-lint-ignore-file no-explicit-any
/**
 * automation-runs — Helper para registrar execuções automáticas.
 *
 * Use no início e no fim de cada job:
 *
 *   const run = await startRun(sb, { job_type: "seed", source: "cron" });
 *   try {
 *     // ... trabalho ...
 *     await finishRun(sb, run, { status: "success", result: { picked: 200 } });
 *   } catch (e) {
 *     await finishRun(sb, run, { status: "error", error: (e as Error).message });
 *   }
 *
 * Idempotente. Falhas em log NUNCA quebram o job.
 */
import { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

export interface RunHandle {
  id: string | null;
  startedAt: number;
}

export async function startRun(
  sb: SupabaseClient,
  opts: { job_type: string; source?: "cron" | "admin" | "internal"; triggered_by?: string | null },
): Promise<RunHandle> {
  const startedAt = Date.now();
  try {
    const { data, error } = await sb
      .from("automation_runs")
      .insert({
        job_type: opts.job_type,
        source: opts.source ?? "cron",
        status: "running",
        triggered_by: opts.triggered_by ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[automation-runs] start insert failed:", error.message);
      return { id: null, startedAt };
    }
    return { id: data.id, startedAt };
  } catch (e) {
    console.warn("[automation-runs] start exception:", (e as Error).message);
    return { id: null, startedAt };
  }
}

export async function finishRun(
  sb: SupabaseClient,
  run: RunHandle,
  opts: { status: "success" | "error" | "partial"; result?: any; error?: string | null },
): Promise<void> {
  if (!run.id) return;
  const duration = Date.now() - run.startedAt;
  try {
    await sb
      .from("automation_runs")
      .update({
        status: opts.status,
        finished_at: new Date().toISOString(),
        duration_ms: duration,
        result: opts.result ?? null,
        error: opts.error ?? null,
      })
      .eq("id", run.id);
  } catch (e) {
    console.warn("[automation-runs] finish exception:", (e as Error).message);
  }
}
