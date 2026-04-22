DELETE FROM vault.secrets WHERE name = 'service_role_key';

-- Revert crons to use the anon key (public bearer) — the edge functions
-- themselves will validate that the request comes from pg_net cron context
-- and only allow draining the queue.
SELECT cron.unschedule('readify-enrich-queue-5min');
SELECT cron.schedule(
  'readify-enrich-queue-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://gjlzkviwzqxyiwaajoly.supabase.co/functions/v1/process-enrichment-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqbHprdml3enF4eWl3YWFqb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MjM3NTUsImV4cCI6MjA5MjA5OTc1NX0.94V9-BC5K_D3qimRwhxrrtBHJ3o4Ly754OJW3CETuVc", "x-cron-source": "readify-internal"}'::jsonb,
    body := '{"_cron": true}'::jsonb
  );
  $cron$
);

SELECT cron.unschedule('readify-normalize-queue-10min');
SELECT cron.schedule(
  'readify-normalize-queue-10min',
  '*/10 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://gjlzkviwzqxyiwaajoly.supabase.co/functions/v1/process-normalization-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqbHprdml3enF4eWl3YWFqb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MjM3NTUsImV4cCI6MjA5MjA5OTc1NX0.94V9-BC5K_D3qimRwhxrrtBHJ3o4Ly754OJW3CETuVc", "x-cron-source": "readify-internal"}'::jsonb,
    body := '{"_cron": true}'::jsonb
  );
  $cron$
);