-- 1) Harden app_events insert policy: reject null user_id explicitly
DROP POLICY IF EXISTS app_events_insert_self ON public.app_events;
CREATE POLICY app_events_insert_self
ON public.app_events
FOR INSERT
TO authenticated
WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

-- 2) Restrict series_enrichment_cache reads to authenticated users only
DROP POLICY IF EXISTS series_enrichment_cache_select_all ON public.series_enrichment_cache;
CREATE POLICY series_enrichment_cache_select_authenticated
ON public.series_enrichment_cache
FOR SELECT
TO authenticated
USING (true);
