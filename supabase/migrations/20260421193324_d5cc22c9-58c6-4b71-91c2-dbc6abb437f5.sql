-- 1) Fila de backfill de séries
CREATE TABLE IF NOT EXISTS public.series_backfill_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL,
  enqueued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | done | skipped | error
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  matched_series_id UUID,
  next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Garantir só 1 entrada pendente por livro
CREATE UNIQUE INDEX IF NOT EXISTS series_backfill_queue_pending_uniq
  ON public.series_backfill_queue (book_id)
  WHERE status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS series_backfill_queue_next
  ON public.series_backfill_queue (status, next_attempt_at)
  WHERE status IN ('pending','processing');

ALTER TABLE public.series_backfill_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "series_backfill_queue_select_admin"
  ON public.series_backfill_queue FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "series_backfill_queue_delete_admin"
  ON public.series_backfill_queue FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2) Função+trigger: ao inserir livro sem série, enfileira
CREATE OR REPLACE FUNCTION public.queue_series_backfill()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Só enfileira se ainda não tem série atribuída
  IF NEW.series_id IS NULL AND NEW.title IS NOT NULL AND length(NEW.title) >= 2 THEN
    INSERT INTO public.series_backfill_queue (book_id)
    VALUES (NEW.id)
    ON CONFLICT (book_id) WHERE status IN ('pending','processing') DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_series_backfill_insert ON public.books;
CREATE TRIGGER trg_queue_series_backfill_insert
  AFTER INSERT ON public.books
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_series_backfill();

-- Também enfileira quando alguém remove o series_id (raro, mas para consistência)
DROP TRIGGER IF EXISTS trg_queue_series_backfill_update ON public.books;
CREATE TRIGGER trg_queue_series_backfill_update
  AFTER UPDATE OF series_id ON public.books
  FOR EACH ROW
  WHEN (NEW.series_id IS NULL AND OLD.series_id IS NOT NULL)
  EXECUTE FUNCTION public.queue_series_backfill();

-- 3) Backfill inicial: enfileira todos os livros sem série já existentes
INSERT INTO public.series_backfill_queue (book_id)
SELECT b.id FROM public.books b
WHERE b.series_id IS NULL
  AND b.title IS NOT NULL
  AND length(b.title) >= 2
ON CONFLICT (book_id) WHERE status IN ('pending','processing') DO NOTHING;