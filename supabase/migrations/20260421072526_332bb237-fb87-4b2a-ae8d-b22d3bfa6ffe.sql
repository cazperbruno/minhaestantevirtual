
-- =====================================================================
-- 1) Função: encontrar duplicata por título+autor (quando não há ISBN)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.find_duplicate_book(
  _title text,
  _author text,
  _content_type content_type DEFAULT 'book',
  _exclude_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id
  FROM public.books b
  WHERE b.content_type = _content_type
    AND (_exclude_id IS NULL OR b.id <> _exclude_id)
    AND similarity(lower(b.title), lower(_title)) >= 0.92
    AND (
      _author IS NULL OR _author = ''
      OR similarity(lower(COALESCE(b.authors_text, '')), lower(_author)) >= 0.85
    )
  ORDER BY 
    similarity(lower(b.title), lower(_title)) DESC,
    similarity(lower(COALESCE(b.authors_text, '')), lower(COALESCE(_author, ''))) DESC,
    b.created_at ASC
  LIMIT 1
$$;

-- =====================================================================
-- 2) Função admin: merge de livros (migra refs e deleta duplicado)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.merge_books(
  _canonical_id uuid,
  _duplicate_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  moved_user_books int := 0;
  moved_reviews int := 0;
  moved_loans int := 0;
  moved_recs int := 0;
  moved_trades_p int := 0;
  moved_trades_r int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
  IF _canonical_id = _duplicate_id THEN
    RAISE EXCEPTION 'cannot merge book with itself';
  END IF;

  -- user_books: evitar conflito (user_id, book_id) UNIQUE
  WITH ins AS (
    UPDATE public.user_books ub
    SET book_id = _canonical_id
    WHERE book_id = _duplicate_id
      AND NOT EXISTS (
        SELECT 1 FROM public.user_books ub2
        WHERE ub2.user_id = ub.user_id AND ub2.book_id = _canonical_id
      )
    RETURNING 1
  )
  SELECT count(*) INTO moved_user_books FROM ins;

  -- Restantes (que conflitavam) são removidos
  DELETE FROM public.user_books WHERE book_id = _duplicate_id;

  UPDATE public.reviews SET book_id = _canonical_id WHERE book_id = _duplicate_id;
  GET DIAGNOSTICS moved_reviews = ROW_COUNT;

  UPDATE public.loans SET book_id = _canonical_id WHERE book_id = _duplicate_id;
  GET DIAGNOSTICS moved_loans = ROW_COUNT;

  UPDATE public.book_recommendations SET book_id = _canonical_id WHERE book_id = _duplicate_id;
  GET DIAGNOSTICS moved_recs = ROW_COUNT;

  UPDATE public.trades SET proposer_book_id = _canonical_id WHERE proposer_book_id = _duplicate_id;
  GET DIAGNOSTICS moved_trades_p = ROW_COUNT;

  UPDATE public.trades SET receiver_book_id = _canonical_id WHERE receiver_book_id = _duplicate_id;
  GET DIAGNOSTICS moved_trades_r = ROW_COUNT;

  -- Limpa fila e o livro duplicado
  DELETE FROM public.enrichment_queue WHERE book_id = _duplicate_id;
  DELETE FROM public.books WHERE id = _duplicate_id;

  RETURN jsonb_build_object(
    'ok', true,
    'canonical', _canonical_id,
    'merged_from', _duplicate_id,
    'user_books', moved_user_books,
    'reviews', moved_reviews,
    'loans', moved_loans,
    'recommendations', moved_recs,
    'trades_proposer', moved_trades_p,
    'trades_receiver', moved_trades_r
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_books(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_books(uuid, uuid) TO authenticated;

-- =====================================================================
-- 3) Fila de normalização de metadados (auto-correção IA)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.metadata_normalization_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL,
  reasons text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  fields_changed text[],
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (book_id, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_meta_norm_pending
  ON public.metadata_normalization_queue (next_attempt_at)
  WHERE status = 'pending';

ALTER TABLE public.metadata_normalization_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_norm_select_admin ON public.metadata_normalization_queue
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY meta_norm_delete_admin ON public.metadata_normalization_queue
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 4) Detector de metadados suspeitos
-- =====================================================================
CREATE OR REPLACE FUNCTION public.book_meta_issues(
  _title text,
  _authors text[]
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  issues text[] := '{}';
  a text;
BEGIN
  -- Título inteiramente em CAPS (>5 chars, sem números)
  IF _title ~ '^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s\-:!?\.]{6,}$' THEN
    issues := array_append(issues, 'title_uppercase');
  END IF;
  -- Título com encoding quebrado (mojibake comum)
  IF _title ~ '(Ã©|Ã¡|Ã³|Ã§|Â |â€)' THEN
    issues := array_append(issues, 'title_mojibake');
  END IF;
  -- Título começando com aspas/lixo
  IF _title ~ '^[\s\-_=*"'']+' THEN
    issues := array_append(issues, 'title_leading_junk');
  END IF;
  -- Autor invertido ("Sobrenome, Nome")
  IF _authors IS NOT NULL THEN
    FOREACH a IN ARRAY _authors LOOP
      IF a ~ '^[A-ZÁÉÍÓÚ][a-záéíóú]+,\s+[A-ZÁÉÍÓÚ]' THEN
        issues := array_append(issues, 'author_inverted');
        EXIT;
      END IF;
      IF a ~ '(Ã©|Ã¡|Ã³|Ã§|Â |â€)' THEN
        issues := array_append(issues, 'author_mojibake');
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN issues;
END;
$$;

-- =====================================================================
-- 5) Trigger: enfileira livros com metadados suspeitos
-- =====================================================================
CREATE OR REPLACE FUNCTION public.queue_metadata_normalization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  issues text[];
BEGIN
  issues := public.book_meta_issues(NEW.title, NEW.authors);
  IF array_length(issues, 1) > 0 THEN
    INSERT INTO public.metadata_normalization_queue (book_id, reasons)
    VALUES (NEW.id, issues)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_metadata_normalization ON public.books;
CREATE TRIGGER trg_queue_metadata_normalization
AFTER INSERT ON public.books
FOR EACH ROW
EXECUTE FUNCTION public.queue_metadata_normalization();

-- =====================================================================
-- 6) Trigger: dedupe automático por título+autor (livros sem ISBN)
-- Detecta na inserção e enfileira merge sugerido (não auto-merge para
-- evitar dataloss; admin confirma via UI).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.merge_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duplicate_id uuid NOT NULL,
  canonical_id uuid NOT NULL,
  similarity_score real NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (duplicate_id)
);

ALTER TABLE public.merge_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY merge_sug_select_admin ON public.merge_suggestions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY merge_sug_update_admin ON public.merge_suggestions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.detect_book_duplicate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dup_id uuid;
  sim real;
BEGIN
  -- Só checa quando NÃO há ISBN (pois ISBN já é dedupe canônico)
  IF NEW.isbn_13 IS NOT NULL OR NEW.isbn_10 IS NOT NULL THEN
    RETURN NEW;
  END IF;

  dup_id := public.find_duplicate_book(
    NEW.title,
    COALESCE(NEW.authors_text, ''),
    NEW.content_type,
    NEW.id
  );

  IF dup_id IS NOT NULL THEN
    SELECT similarity(lower(b.title), lower(NEW.title)) INTO sim
    FROM public.books b WHERE b.id = dup_id;

    INSERT INTO public.merge_suggestions (duplicate_id, canonical_id, similarity_score)
    VALUES (NEW.id, dup_id, COALESCE(sim, 0.92))
    ON CONFLICT (duplicate_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detect_book_duplicate ON public.books;
CREATE TRIGGER trg_detect_book_duplicate
AFTER INSERT ON public.books
FOR EACH ROW
EXECUTE FUNCTION public.detect_book_duplicate();
