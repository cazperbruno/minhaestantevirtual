-- ============================================================
-- READIFY P0 — SECURE INTERNAL CRON
-- 2026-09-08
--
-- Removes any historical queue jobs and recreates them without embedding anon
-- or service credentials in cron.job. The service role is resolved at runtime
-- from the database setting already used by Readify server-side integrations.
-- ============================================================

DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname LIKE 'process-enrichment-queue%'
       OR jobname LIKE 'process-normalization-queue%'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'process-enrichment-queue-secure-2min',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://gjlzkviwzqxyiwaajoly.supabase.co/functions/v1/process-enrichment-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
      'apikey', current_setting('app.service_role_key', true),
      'x-cron-source', 'readify-internal'
    ),
    body := jsonb_build_object('time', now())
  )
  WHERE nullif(current_setting('app.service_role_key', true), '') IS NOT NULL;
  $cron$
);

SELECT cron.schedule(
  'process-normalization-queue-secure-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://gjlzkviwzqxyiwaajoly.supabase.co/functions/v1/process-normalization-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
      'apikey', current_setting('app.service_role_key', true),
      'x-cron-source', 'readify-internal'
    ),
    body := jsonb_build_object('time', now())
  )
  WHERE nullif(current_setting('app.service_role_key', true), '') IS NOT NULL;
  $cron$
);
