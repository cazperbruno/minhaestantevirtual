-- Store the service role key in vault so cron jobs can authenticate as service_role
-- against admin-guard-protected functions (process-enrichment-queue, process-normalization-queue).
DO $$
DECLARE
  v_service_role text := 'REPLACED_BELOW';
BEGIN
  -- Only insert if not present
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'service_role_key') THEN
    PERFORM vault.create_secret(
      'PLACEHOLDER_SERVICE_ROLE_KEY',
      'service_role_key',
      'Service role key used by cron jobs to call admin-only edge functions'
    );
  END IF;
END $$;

-- Reschedule the enrichment queue cron to use service_role from vault
SELECT cron.unschedule('readify-enrich-queue-5min');
SELECT cron.schedule(
  'readify-enrich-queue-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://gjlzkviwzqxyiwaajoly.supabase.co/functions/v1/process-enrichment-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- Reschedule the normalization queue cron the same way
SELECT cron.unschedule('readify-normalize-queue-10min');
SELECT cron.schedule(
  'readify-normalize-queue-10min',
  '*/10 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://gjlzkviwzqxyiwaajoly.supabase.co/functions/v1/process-normalization-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);