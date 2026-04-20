
-- ENGINE DE RECOMENDAÇÃO + APRENDIZADO CONTÍNUO

CREATE TABLE IF NOT EXISTS public.user_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('view','click','dismiss','favorite','add','rate','search','finish','abandon')),
  weight real NOT NULL DEFAULT 1.0,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_interactions_user_created ON public.user_interactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_interactions_book ON public.user_interactions(book_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_book_kind ON public.user_interactions(user_id, book_id, kind);

ALTER TABLE public.user_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interactions_select_own" ON public.user_interactions;
CREATE POLICY "interactions_select_own" ON public.user_interactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "interactions_insert_own" ON public.user_interactions;
CREATE POLICY "interactions_insert_own" ON public.user_interactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "interactions_delete_own" ON public.user_interactions;
CREATE POLICY "interactions_delete_own" ON public.user_interactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Helper: contar elementos em comum entre dois arrays
CREATE OR REPLACE FUNCTION public.array_intersect_count(a text[], b text[])
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT COUNT(*)::int FROM (
    SELECT unnest(COALESCE(a, ARRAY[]::text[]))
    INTERSECT
    SELECT unnest(COALESCE(b, ARRAY[]::text[]))
  ) AS shared;
$$;

-- Função: livros similares (filtragem por conteúdo)
CREATE OR REPLACE FUNCTION public.similar_books(_book_id uuid, _limit int DEFAULT 12)
RETURNS TABLE (id uuid, score real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH source AS (
    SELECT authors, categories FROM public.books WHERE id = _book_id
  )
  SELECT b.id,
    (public.array_intersect_count(b.authors, (SELECT authors FROM source)) * 3.0
     + public.array_intersect_count(b.categories, (SELECT categories FROM source)) * 1.0
    )::real AS score
  FROM public.books b, source
  WHERE b.id <> _book_id
    AND (b.authors && source.authors OR b.categories && source.categories)
  ORDER BY score DESC, b.created_at DESC
  LIMIT _limit;
$$;

-- View: livros em alta
CREATE OR REPLACE VIEW public.trending_books AS
SELECT
  b.id,
  COUNT(DISTINCT ub.user_id)::int AS readers,
  COUNT(DISTINCT i.user_id)::int AS recent_interactions,
  (COUNT(DISTINCT ub.user_id) * 3 + COUNT(DISTINCT i.user_id))::int AS score
FROM public.books b
LEFT JOIN public.user_books ub ON ub.book_id = b.id AND ub.created_at > now() - interval '30 days'
LEFT JOIN public.user_interactions i ON i.book_id = b.id AND i.created_at > now() - interval '7 days'
GROUP BY b.id
HAVING COUNT(DISTINCT ub.user_id) > 0 OR COUNT(DISTINCT i.user_id) > 0;

-- Função: gêneros favoritos com peso
CREATE OR REPLACE FUNCTION public.user_taste(_user_id uuid)
RETURNS TABLE (category text, weight real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    cat AS category,
    SUM(
      CASE
        WHEN ub.status = 'read' AND ub.rating >= 4 THEN 5.0
        WHEN ub.status = 'read' THEN 3.0
        WHEN ub.status = 'reading' THEN 2.0
        WHEN ub.status = 'wishlist' THEN 1.0
        ELSE 0.5
      END
    )::real AS weight
  FROM public.user_books ub
  JOIN public.books b ON b.id = ub.book_id
  CROSS JOIN LATERAL unnest(COALESCE(b.categories, ARRAY[]::text[])) AS cat
  WHERE ub.user_id = _user_id
  GROUP BY cat
  ORDER BY weight DESC
  LIMIT 20;
$$;

-- Engine principal
CREATE OR REPLACE FUNCTION public.recommend_for_user(_user_id uuid, _limit int DEFAULT 30)
RETURNS TABLE (
  id uuid,
  affinity real,
  popularity real,
  score real,
  reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH
  user_lib AS (
    SELECT book_id FROM public.user_books WHERE user_id = _user_id
  ),
  user_dismissed AS (
    SELECT DISTINCT book_id FROM public.user_interactions
    WHERE user_id = _user_id AND kind IN ('dismiss','abandon')
  ),
  taste AS (SELECT * FROM public.user_taste(_user_id)),
  declared AS (
    SELECT unnest(COALESCE(favorite_genres, ARRAY[]::text[])) AS category
    FROM public.profiles WHERE id = _user_id
  ),
  loved_authors AS (
    SELECT DISTINCT unnest(b.authors) AS author
    FROM public.user_books ub JOIN public.books b ON b.id = ub.book_id
    WHERE ub.user_id = _user_id AND ub.rating >= 4
  ),
  scored AS (
    SELECT
      b.id,
      (COALESCE((
        SELECT SUM(t.weight) FROM taste t
        WHERE t.category = ANY(COALESCE(b.categories, ARRAY[]::text[]))
      ), 0)
      + COALESCE((
        SELECT COUNT(*) * 2.0 FROM declared d
        WHERE d.category = ANY(COALESCE(b.categories, ARRAY[]::text[]))
      ), 0)
      + CASE
          WHEN EXISTS (SELECT 1 FROM loved_authors la WHERE la.author = ANY(b.authors))
          THEN 8.0 ELSE 0.0
        END)::real AS affinity,
      COALESCE((SELECT (readers + recent_interactions)::real FROM public.trending_books tb WHERE tb.id = b.id), 0)::real AS popularity
    FROM public.books b
    WHERE b.cover_url IS NOT NULL
      AND b.id NOT IN (SELECT book_id FROM user_lib)
      AND b.id NOT IN (SELECT book_id FROM user_dismissed)
  )
  SELECT
    s.id,
    s.affinity,
    s.popularity,
    (s.affinity * 1.0 + LEAST(s.popularity, 50.0) * 0.3)::real AS score,
    CASE
      WHEN s.affinity > 10 THEN 'Combina muito com seus gostos'
      WHEN s.affinity > 3 THEN 'Por seus gêneros favoritos'
      WHEN s.popularity > 5 THEN 'Em alta agora'
      ELSE 'Talvez você goste'
    END AS reason
  FROM scored s
  WHERE (s.affinity + s.popularity) > 0
  ORDER BY score DESC, RANDOM()
  LIMIT _limit;
END $$;

-- Trigger de auto-tracking
CREATE OR REPLACE FUNCTION public.track_user_book_interaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_interactions (user_id, book_id, kind, weight)
    VALUES (NEW.user_id, NEW.book_id, 'add', 2.0);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'read' AND OLD.status <> 'read' THEN
      INSERT INTO public.user_interactions (user_id, book_id, kind, weight)
      VALUES (NEW.user_id, NEW.book_id, 'finish', 5.0);
    END IF;
    IF NEW.rating IS NOT NULL AND NEW.rating IS DISTINCT FROM OLD.rating THEN
      INSERT INTO public.user_interactions (user_id, book_id, kind, weight, meta)
      VALUES (NEW.user_id, NEW.book_id, 'rate', NEW.rating::real, jsonb_build_object('rating', NEW.rating));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_track_user_book ON public.user_books;
CREATE TRIGGER trg_track_user_book
AFTER INSERT OR UPDATE ON public.user_books
FOR EACH ROW EXECUTE FUNCTION public.track_user_book_interaction();
