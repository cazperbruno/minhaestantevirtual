
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Coluna comum (não generated) — sincronizada via trigger pra ser IMMUTABLE-compatible em índices
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS authors_text text;

CREATE OR REPLACE FUNCTION public.sync_books_authors_text()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.authors_text := array_to_string(coalesce(NEW.authors, ARRAY[]::text[]), ' ');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_books_sync_authors_text ON public.books;
CREATE TRIGGER trg_books_sync_authors_text
  BEFORE INSERT OR UPDATE OF authors ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.sync_books_authors_text();

-- Backfill
UPDATE public.books
SET authors_text = array_to_string(coalesce(authors, ARRAY[]::text[]), ' ')
WHERE authors_text IS NULL;

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS books_isbn_10_unique
  ON public.books (isbn_10) WHERE isbn_10 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_books_title_trgm
  ON public.books USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_books_authors_text_trgm
  ON public.books USING gin (authors_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON public.books (created_at DESC);

-- RPC: busca interna avançada
CREATE OR REPLACE FUNCTION public.search_books_internal(
  q text,
  lim int DEFAULT 20
)
RETURNS TABLE (
  id uuid, title text, subtitle text, authors text[],
  cover_url text, isbn_13 text, isbn_10 text,
  published_year int, content_type content_type, rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH norm AS (
    SELECT regexp_replace(coalesce(q,''), '[^0-9Xx]', '', 'g') AS qisbn
  ),
  base AS (
    SELECT b.*,
      CASE
        WHEN length((SELECT qisbn FROM norm)) IN (10,13)
         AND ((SELECT qisbn FROM norm) = b.isbn_13 OR (SELECT qisbn FROM norm) = b.isbn_10)
        THEN 10.0 ELSE 0.0
      END AS s_isbn,
      ts_rank(
        to_tsvector('portuguese', coalesce(b.title,'') || ' ' || coalesce(b.subtitle,'') || ' ' || coalesce(b.authors_text,'')),
        plainto_tsquery('portuguese', q)
      ) AS s_fts,
      similarity(b.title, q) AS s_title_trgm,
      similarity(coalesce(b.authors_text,''), q) AS s_author_trgm,
      coalesce((SELECT count(*)::real FROM user_books ub WHERE ub.book_id = b.id), 0) AS pop
    FROM books b
    WHERE
      (length((SELECT qisbn FROM norm)) IN (10,13)
        AND ((SELECT qisbn FROM norm) = b.isbn_13 OR (SELECT qisbn FROM norm) = b.isbn_10))
      OR to_tsvector('portuguese', coalesce(b.title,'') || ' ' || coalesce(b.authors_text,''))
         @@ plainto_tsquery('portuguese', q)
      OR b.title % q
      OR coalesce(b.authors_text,'') % q
  )
  SELECT
    base.id, base.title, base.subtitle, base.authors, base.cover_url,
    base.isbn_13, base.isbn_10, base.published_year, base.content_type,
    (s_isbn * 10 + s_fts * 4 + s_title_trgm * 3 + s_author_trgm * 2 + LEAST(pop, 50) * 0.05)::real AS rank
  FROM base
  WHERE (s_isbn + s_fts + s_title_trgm + s_author_trgm) > 0.15
  ORDER BY rank DESC, base.created_at DESC
  LIMIT GREATEST(lim, 1);
$$;

GRANT EXECUTE ON FUNCTION public.search_books_internal(text, int) TO anon, authenticated;

-- Fila de enriquecimento
CREATE TABLE IF NOT EXISTS public.enrichment_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','skipped')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  fields_filled text[]
);

CREATE INDEX IF NOT EXISTS idx_enrichment_status_next
  ON public.enrichment_queue (status, next_attempt_at) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrichment_book_pending
  ON public.enrichment_queue (book_id) WHERE status IN ('pending','processing');

ALTER TABLE public.enrichment_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enrichment_select_admin ON public.enrichment_queue;
CREATE POLICY enrichment_select_admin ON public.enrichment_queue
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS enrichment_delete_admin ON public.enrichment_queue;
CREATE POLICY enrichment_delete_admin ON public.enrichment_queue
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger: enfileira livros incompletos automaticamente
CREATE OR REPLACE FUNCTION public.queue_book_enrichment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.description IS NULL
     OR length(NEW.description) < 80
     OR NEW.cover_url IS NULL
     OR NEW.categories IS NULL
     OR array_length(NEW.categories, 1) IS NULL
     OR NEW.page_count IS NULL
  THEN
    INSERT INTO public.enrichment_queue (book_id) VALUES (NEW.id)
    ON CONFLICT (book_id) WHERE status IN ('pending','processing') DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_books_enqueue_enrichment ON public.books;
CREATE TRIGGER trg_books_enqueue_enrichment
  AFTER INSERT ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.queue_book_enrichment();

-- Quality score & report
CREATE OR REPLACE FUNCTION public.book_quality_score(b public.books)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (
    (CASE WHEN b.isbn_13 IS NOT NULL THEN 20 ELSE 0 END) +
    (CASE WHEN b.cover_url IS NOT NULL THEN 20 ELSE 0 END) +
    (CASE WHEN b.description IS NOT NULL AND length(b.description) >= 200 THEN 20
          WHEN b.description IS NOT NULL AND length(b.description) >= 80 THEN 10 ELSE 0 END) +
    (CASE WHEN array_length(b.authors,1) >= 1 THEN 10 ELSE 0 END) +
    (CASE WHEN array_length(b.categories,1) >= 1 THEN 10 ELSE 0 END) +
    (CASE WHEN b.page_count IS NOT NULL THEN 10 ELSE 0 END) +
    (CASE WHEN b.published_year IS NOT NULL THEN 10 ELSE 0 END)
  )::int;
$$;

CREATE OR REPLACE VIEW public.books_quality_report
WITH (security_invoker = true) AS
SELECT
  count(*)::bigint                                                            AS total_books,
  count(isbn_13)::bigint                                                      AS with_isbn13,
  count(*) FILTER (WHERE cover_url IS NOT NULL)::bigint                       AS with_cover,
  count(*) FILTER (WHERE description IS NOT NULL AND length(description) >= 200)::bigint AS with_rich_desc,
  count(*) FILTER (WHERE array_length(categories,1) >= 1)::bigint             AS with_categories,
  count(*) FILTER (WHERE page_count IS NOT NULL)::bigint                      AS with_pages,
  count(*) FILTER (WHERE series_id IS NOT NULL)::bigint                       AS with_series,
  round(avg(public.book_quality_score(b))::numeric, 1)                        AS avg_quality_score,
  count(*) FILTER (WHERE public.book_quality_score(b) < 50)::bigint           AS poor_quality_count
FROM public.books b;
