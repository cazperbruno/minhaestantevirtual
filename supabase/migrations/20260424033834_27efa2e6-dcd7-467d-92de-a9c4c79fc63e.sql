
-- 1) Corrige similarity() não encontrada: qualifica search_path para incluir extensions
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
SET search_path = public, extensions
AS $$
  SELECT b.id
  FROM public.books b
  WHERE b.content_type = _content_type
    AND (_exclude_id IS NULL OR b.id <> _exclude_id)
    AND extensions.similarity(lower(b.title), lower(_title)) >= 0.92
    AND (
      _author IS NULL OR _author = ''
      OR extensions.similarity(lower(COALESCE(b.authors_text, '')), lower(_author)) >= 0.85
    )
  ORDER BY 
    extensions.similarity(lower(b.title), lower(_title)) DESC,
    extensions.similarity(lower(COALESCE(b.authors_text, '')), lower(COALESCE(_author, ''))) DESC,
    b.created_at ASC
  LIMIT 1
$$;

-- 2) RPC para o usuário resetar a biblioteca (mantém conta/profile)
CREATE OR REPLACE FUNCTION public.reset_my_library()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  c_user_books int := 0;
  c_reviews int := 0;
  c_loans int := 0;
  c_trades int := 0;
  c_recs int := 0;
  c_activities int := 0;
  c_notes int := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  DELETE FROM public.user_books WHERE user_id = uid;
  GET DIAGNOSTICS c_user_books = ROW_COUNT;

  DELETE FROM public.reviews WHERE user_id = uid;
  GET DIAGNOSTICS c_reviews = ROW_COUNT;

  DELETE FROM public.loans WHERE user_id = uid;
  GET DIAGNOSTICS c_loans = ROW_COUNT;

  DELETE FROM public.trades WHERE proposer_id = uid OR receiver_id = uid;
  GET DIAGNOSTICS c_trades = ROW_COUNT;

  DELETE FROM public.book_recommendations WHERE user_id = uid;
  GET DIAGNOSTICS c_recs = ROW_COUNT;

  DELETE FROM public.activities WHERE user_id = uid;
  GET DIAGNOSTICS c_activities = ROW_COUNT;

  -- Notas/anotações (se existir tabela)
  IF to_regclass('public.book_notes') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.book_notes WHERE user_id = $1' USING uid;
    GET DIAGNOSTICS c_notes = ROW_COUNT;
  END IF;

  -- Trade matches envolvendo o usuário
  IF to_regclass('public.trade_matches') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.trade_matches WHERE offerer_id = $1 OR wisher_id = $1' USING uid;
  END IF;

  RETURN jsonb_build_object(
    'user_books', c_user_books,
    'reviews', c_reviews,
    'loans', c_loans,
    'trades', c_trades,
    'recommendations', c_recs,
    'activities', c_activities,
    'notes', c_notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_my_library() TO authenticated;
