-- Habilita realtime para tabelas sociais (follows, notifications, reviews)
-- REPLICA IDENTITY FULL garante que payloads de UPDATE/DELETE tragam a linha completa
ALTER TABLE public.follows REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.reviews REPLICA IDENTITY FULL;
ALTER TABLE public.review_likes REPLICA IDENTITY FULL;
ALTER TABLE public.review_comments REPLICA IDENTITY FULL;

-- Adiciona à publicação supabase_realtime (idempotente — ignora se já estiver)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.follows; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.review_likes; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.review_comments; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;