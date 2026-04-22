
-- 1) Cooldowns na tabela books
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_cover_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS cover_quality smallint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS books_last_enriched_at_idx
  ON public.books (last_enriched_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS books_last_cover_check_at_idx
  ON public.books (last_cover_check_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS books_cover_quality_idx
  ON public.books (cover_quality);

-- 2) Tabela de execuções de automação
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  source text NOT NULL DEFAULT 'cron',
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  triggered_by uuid,
  result jsonb,
  error text
);

CREATE INDEX IF NOT EXISTS automation_runs_started_idx
  ON public.automation_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS automation_runs_job_type_idx
  ON public.automation_runs (job_type, started_at DESC);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_runs_select_admin ON public.automation_runs;
CREATE POLICY automation_runs_select_admin
  ON public.automation_runs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
