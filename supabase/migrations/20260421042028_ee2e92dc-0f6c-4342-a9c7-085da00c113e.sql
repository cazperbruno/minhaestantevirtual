-- Adicionar user_books e activities ao publication realtime
-- (reviews, review_likes, review_comments, follows já estão)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_books'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_books;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'activities'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
  END IF;
END $$;

-- REPLICA IDENTITY FULL para entregar payloads completos (essencial para
-- DELETEs em user_books — sem isso, payload.old chega vazio).
ALTER TABLE public.user_books REPLICA IDENTITY FULL;
ALTER TABLE public.activities REPLICA IDENTITY FULL;