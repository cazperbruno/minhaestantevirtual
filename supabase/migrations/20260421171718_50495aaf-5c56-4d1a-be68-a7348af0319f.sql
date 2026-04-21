-- Habilita Realtime para tabelas books e series.
-- Isso permite que mudanças (novo volume com series_id, atualização de
-- total_volumes, capa, status) propaguem em tempo real para os clientes,
-- mantendo a página "Minhas Séries" sempre fresca, no estilo Instagram/Facebook.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'books'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.books;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'series'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.series;
  END IF;
END $$;

-- REPLICA IDENTITY FULL garante que o payload das atualizações inclua
-- todas as colunas (necessário para a lógica de invalidação por series_id).
ALTER TABLE public.books REPLICA IDENTITY FULL;
ALTER TABLE public.series REPLICA IDENTITY FULL;
ALTER TABLE public.user_books REPLICA IDENTITY FULL;