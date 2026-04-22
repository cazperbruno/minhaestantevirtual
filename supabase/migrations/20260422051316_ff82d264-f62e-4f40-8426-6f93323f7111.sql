-- ============ A) PERFORMANCE: Cron mais frequente para drenar fila ============
-- Remove o job antigo se existir e recria com 2 min
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'process-enrichment-queue-5min';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'process-enrichment-queue-2min';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'process-enrichment-queue-2min',
  '*/2 * * * *',
  $$
  select net.http_post(
    url:='https://gjlzkviwzqxyiwaajoly.supabase.co/functions/v1/process-enrichment-queue',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqbHprdml3enF4eWl3YWFqb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MjM3NTUsImV4cCI6MjA5MjA5OTc1NX0.94V9-BC5K_D3qimRwhxrrtBHJ3o4Ly754OJW3CETuVc","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqbHprdml3enF4eWl3YWFqb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MjM3NTUsImV4cCI6MjA5MjA5OTc1NX0.94V9-BC5K_D3qimRwhxrrtBHJ3o4Ly754OJW3CETuVc"}'::jsonb,
    body:=concat('{"time":"', now(), '"}')::jsonb
  );
  $$
);

-- ============ B) SEGURANÇA: Restringir INSERT em books a admins ============
DROP POLICY IF EXISTS books_insert_auth ON public.books;

CREATE POLICY books_insert_admin
ON public.books
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND length(title) > 0);

-- ============ C) PRIVACIDADE: Remover filas internas do Realtime ============
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='enrichment_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.enrichment_queue;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='metadata_normalization_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.metadata_normalization_queue;
  END IF;
END $$;