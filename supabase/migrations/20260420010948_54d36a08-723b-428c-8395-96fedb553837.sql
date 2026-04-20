-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_books_user_status_book
  ON public.user_books(user_id, status, book_id);

CREATE INDEX IF NOT EXISTS idx_user_books_book_status
  ON public.user_books(book_id, status);

-- Step 1: Find reading twins
CREATE OR REPLACE FUNCTION public.get_similar_users(target_user_id uuid)
RETURNS TABLE(similar_user_id uuid, common_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ub2.user_id   AS similar_user_id,
    COUNT(*)::int AS common_count
  FROM public.user_books ub1
  JOIN public.user_books ub2
    ON  ub1.book_id  = ub2.book_id
    AND ub2.user_id <> target_user_id
  WHERE ub1.user_id = target_user_id
    AND ub1.status  = 'read'
    AND ub2.status  = 'read'
  GROUP BY ub2.user_id
  HAVING COUNT(*) >= 3;
$$;

-- Step 2: Collaborative recommendations from twins (renamed CTE 'similar' -> 'twins')
CREATE OR REPLACE FUNCTION public.get_collaborative_recommendations(target_user_id uuid)
RETURNS TABLE(book_id uuid, collab_score numeric, reader_count int, avg_rating numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH twins AS (
    SELECT similar_user_id, common_count
    FROM public.get_similar_users(target_user_id)
  ),
  already AS (
    SELECT ub.book_id FROM public.user_books ub WHERE ub.user_id = target_user_id
  ),
  candidates AS (
    SELECT
      ub.book_id,
      COUNT(*)::int                AS reader_count,
      COALESCE(AVG(ub.rating), 3)  AS avg_rating
    FROM twins t
    JOIN public.user_books ub ON ub.user_id = t.similar_user_id
    WHERE ub.status = 'read'
      AND ub.book_id NOT IN (SELECT book_id FROM already)
    GROUP BY ub.book_id
  )
  SELECT
    c.book_id,
    ROUND((c.reader_count * 2 + c.avg_rating)::numeric, 2) AS collab_score,
    c.reader_count,
    ROUND(c.avg_rating::numeric, 2) AS avg_rating
  FROM candidates c
  ORDER BY collab_score DESC;
$$;

-- Step 3: Drop and recreate recommend_for_user with new return signature
DROP FUNCTION IF EXISTS public.recommend_for_user(uuid, integer);

CREATE OR REPLACE FUNCTION public.recommend_for_user(_user_id uuid, _limit integer DEFAULT 30)
RETURNS TABLE(id uuid, affinity real, popularity real, score real, reason text, collab_readers int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_twins boolean;
  w_collab real;
  w_content real;
  w_trending real;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.get_similar_users(_user_id) LIMIT 1) INTO has_twins;

  IF has_twins THEN
    w_collab := 0.5; w_content := 0.3; w_trending := 0.2;
  ELSE
    w_collab := 0.0; w_content := 0.6; w_trending := 0.4;
  END IF;

  RETURN QUERY
  WITH
  user_lib AS (
    SELECT ub.book_id FROM public.user_books ub WHERE ub.user_id = _user_id
  ),
  user_dismissed AS (
    SELECT DISTINCT ui.book_id FROM public.user_interactions ui
    WHERE ui.user_id = _user_id AND ui.kind IN ('dismiss','abandon')
  ),
  taste AS (SELECT * FROM public.user_taste(_user_id)),
  declared AS (
    SELECT unnest(COALESCE(p.favorite_genres, ARRAY[]::text[])) AS category
    FROM public.profiles p WHERE p.id = _user_id
  ),
  loved_authors AS (
    SELECT DISTINCT unnest(b.authors) AS author
    FROM public.user_books ub JOIN public.books b ON b.id = ub.book_id
    WHERE ub.user_id = _user_id AND ub.rating >= 4
  ),
  collab AS (
    SELECT * FROM public.get_collaborative_recommendations(_user_id)
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
      COALESCE((SELECT (tb.readers + tb.recent_interactions)::real FROM public.trending_books tb WHERE tb.id = b.id), 0)::real AS popularity,
      COALESCE((SELECT c.collab_score::real FROM collab c WHERE c.book_id = b.id), 0)::real AS collab_score,
      COALESCE((SELECT c.reader_count FROM collab c WHERE c.book_id = b.id), 0) AS collab_readers
    FROM public.books b
    WHERE b.cover_url IS NOT NULL
      AND b.id NOT IN (SELECT ul.book_id FROM user_lib ul)
      AND b.id NOT IN (SELECT ud.book_id FROM user_dismissed ud)
  )
  SELECT
    s.id,
    s.affinity,
    s.popularity,
    (s.collab_score * w_collab
     + s.affinity * w_content
     + LEAST(s.popularity, 50.0) * w_trending * 0.3)::real AS score,
    CASE
      WHEN s.collab_readers >= 3 THEN 'Leitores com seu gosto adoraram'
      WHEN s.collab_readers >= 1 THEN 'Leitores parecidos leram'
      WHEN s.affinity > 10 THEN 'Combina muito com seus gostos'
      WHEN s.affinity > 3 THEN 'Por seus gêneros favoritos'
      WHEN s.popularity > 5 THEN 'Em alta agora'
      ELSE 'Talvez você goste'
    END AS reason,
    s.collab_readers
  FROM scored s
  WHERE (s.affinity + s.popularity + s.collab_score) > 0
  ORDER BY score DESC, RANDOM()
  LIMIT _limit;
END $$;