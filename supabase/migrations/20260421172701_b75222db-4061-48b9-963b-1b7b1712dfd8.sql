-- Habilita Realtime para tabelas que afetam UI do usuário em múltiplas telas.
-- Mantém o app sincronizado em tempo real (estilo Instagram/WhatsApp).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='loans') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.loans;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='reading_goals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reading_goals;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- REPLICA IDENTITY FULL: payload dos UPDATE/DELETE inclui colunas necessárias
-- para filtrar invalidações por user_id no cliente.
ALTER TABLE public.loans REPLICA IDENTITY FULL;
ALTER TABLE public.reading_goals REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;