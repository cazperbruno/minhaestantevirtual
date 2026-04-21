
-- 1) Coluna quality_score (0..100) persistida em books
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS quality_score smallint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS books_quality_score_idx
  ON public.books (quality_score);

-- 2) Função pura que calcula o score a partir das colunas atuais
CREATE OR REPLACE FUNCTION public.compute_book_quality_score(
  _title text,
  _authors text[],
  _isbn_13 text,
  _isbn_10 text,
  _description text,
  _cover_url text,
  _categories text[],
  _publisher text,
  _published_year int,
  _page_count int,
  _language text,
  _series_id uuid
) RETURNS smallint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s int := 0;
BEGIN
  IF _title IS NOT NULL AND length(trim(_title)) >= 2 THEN s := s + 10; END IF;
  IF _authors IS NOT NULL AND array_length(_authors,1) >= 1 AND length(coalesce(_authors[1],'')) >= 2 THEN s := s + 10; END IF;
  IF _isbn_13 IS NOT NULL AND length(_isbn_13) >= 10 THEN s := s + 15;
  ELSIF _isbn_10 IS NOT NULL AND length(_isbn_10) >= 9 THEN s := s + 8; END IF;
  IF _cover_url IS NOT NULL AND length(_cover_url) > 10 THEN s := s + 20; END IF;
  IF _description IS NOT NULL AND length(_description) >= 200 THEN s := s + 15;
  ELSIF _description IS NOT NULL AND length(_description) >= 60 THEN s := s + 7; END IF;
  IF _categories IS NOT NULL AND array_length(_categories,1) >= 1 THEN s := s + 8; END IF;
  IF _publisher IS NOT NULL AND length(_publisher) >= 2 THEN s := s + 5; END IF;
  IF _published_year IS NOT NULL AND _published_year BETWEEN 1400 AND extract(year from now())::int + 1 THEN s := s + 5; END IF;
  IF _page_count IS NOT NULL AND _page_count > 0 THEN s := s + 4; END IF;
  IF _language IS NOT NULL AND length(_language) >= 2 THEN s := s + 4; END IF;
  IF _series_id IS NOT NULL THEN s := s + 4; END IF;
  IF s > 100 THEN s := 100; END IF;
  IF s < 0 THEN s := 0; END IF;
  RETURN s::smallint;
END;
$$;

-- 3) Trigger para manter o score sempre atualizado
CREATE OR REPLACE FUNCTION public.tg_books_quality_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.quality_score := public.compute_book_quality_score(
    NEW.title, NEW.authors, NEW.isbn_13, NEW.isbn_10, NEW.description,
    NEW.cover_url, NEW.categories, NEW.publisher, NEW.published_year,
    NEW.page_count, NEW.language, NEW.series_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS books_quality_score_trg ON public.books;
CREATE TRIGGER books_quality_score_trg
BEFORE INSERT OR UPDATE OF title, authors, isbn_13, isbn_10, description,
  cover_url, categories, publisher, published_year, page_count, language, series_id
ON public.books
FOR EACH ROW
EXECUTE FUNCTION public.tg_books_quality_score();

-- Backfill score para o catálogo existente
UPDATE public.books SET quality_score = public.compute_book_quality_score(
  title, authors, isbn_13, isbn_10, description, cover_url,
  categories, publisher, published_year, page_count, language, series_id
)
WHERE quality_score = 0;

-- 4) Tabela de log de auditoria
CREATE TABLE IF NOT EXISTS public.book_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid,
  process text NOT NULL,           -- 'clean-book-database', 'normalize-book-meta', 'fix-book-covers', 'merge-duplicate-books', etc.
  action text NOT NULL,            -- 'patch', 'merge', 'cover_replaced', 'series_linked', 'deleted'
  fields_changed text[] DEFAULT '{}'::text[],
  before jsonb,
  after jsonb,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS book_audit_log_book_idx ON public.book_audit_log (book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS book_audit_log_process_idx ON public.book_audit_log (process, created_at DESC);

ALTER TABLE public.book_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS book_audit_log_select_admin ON public.book_audit_log;
CREATE POLICY book_audit_log_select_admin
ON public.book_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Relatório agregado de qualidade por dia (view simples)
CREATE OR REPLACE VIEW public.book_quality_trend AS
SELECT
  date_trunc('day', updated_at)::date AS day,
  count(*) AS books_touched,
  round(avg(quality_score)::numeric, 1) AS avg_score,
  count(*) FILTER (WHERE quality_score < 50) AS poor_count
FROM public.books
GROUP BY 1
ORDER BY 1 DESC;
