ALTER PUBLICATION supabase_realtime ADD TABLE public.enrichment_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.metadata_normalization_queue;
ALTER TABLE public.enrichment_queue REPLICA IDENTITY FULL;
ALTER TABLE public.metadata_normalization_queue REPLICA IDENTITY FULL;