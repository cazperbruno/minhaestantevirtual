CREATE OR REPLACE FUNCTION public.recommend_for_user(_user_id uuid, _limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, score real, affinity real, popularity real, collab_readers integer, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_w_collab real; v_w_content real; v_w_trending real;
  v_prefs public.content_type[];
BEGIN
  SELECT w_collab, w_content, w_trending
    INTO v_w_collab, v_w_content, v_w_trending
  FROM public.user_weights uw WHERE uw.user_id = _user_id;
  IF v_w_collab IS NULL THEN
    v_w_collab := 0.5; v_w_content := 0.3; v_w_trending := 0.2;
  END IF;

  SELECT COALESCE(p.content_types, ARRAY['book']::public.content_type[])
    INTO v_prefs FROM public.profiles p WHERE p.id = _user_id;
  IF v_prefs IS NULL OR array_length(v_prefs, 1) IS NULL THEN
    v_prefs := ARRAY['book']::public.content_type[];
  END IF;

  RETURN QUERY
  WITH user_cats AS (SELECT category, weight FROM public.user_taste(_user_id)),
  content_scored AS (
    SELECT b.id AS book_id,
      COALESCE(SUM(uc.weight) FILTER (WHERE uc.category = ANY(b.categories)), 0)::real AS affinity
    FROM public.books b
    LEFT JOIN user_cats uc ON uc.category = ANY(b.categories)
    WHERE b.content_type = ANY(v_prefs)
    GROUP BY b.id
  ),
  trending_scored AS (
    SELECT tb.id AS book_id, COALESCE(tb.score, 0)::real AS popularity
    FROM public.trending_books tb
    JOIN public.books b ON b.id = tb.id
    WHERE b.content_type = ANY(v_prefs)
  ),
  collab AS (
    SELECT cr.book_id, cr.reader_count, cr.collab_score
    FROM public.get_collaborative_recommendations(_user_id) cr
    JOIN public.books b ON b.id = cr.book_id
    WHERE b.content_type = ANY(v_prefs)
  ),
  recent_searches AS (
    SELECT lower(sl.query) AS q FROM public.search_log sl
    WHERE sl.user_id = _user_id AND sl.created_at > now() - interval '7 days'
  ),
  search_boost AS (
    SELECT b.id AS book_id,
      CASE WHEN EXISTS (
        SELECT 1 FROM recent_searches rs
        WHERE lower(b.title) LIKE '%' || rs.q || '%'
           OR EXISTS (SELECT 1 FROM unnest(b.authors) a WHERE lower(a) LIKE '%' || rs.q || '%')
      ) THEN 1.0::real ELSE 0::real END AS boost
    FROM public.books b WHERE b.content_type = ANY(v_prefs)
  ),
  seen AS (
    SELECT ub.book_id FROM public.user_books ub WHERE ub.user_id = _user_id
    UNION
    SELECT ui.book_id FROM public.user_interactions ui WHERE ui.user_id = _user_id AND ui.kind = 'dismiss'
  )
  SELECT
    b.id,
    (v_w_content * COALESCE(cs.affinity, 0)
     + v_w_collab * COALESCE(co.collab_score, 0)
     + v_w_trending * COALESCE(ts.popularity, 0)
     + 0.5 * COALESCE(sb.boost, 0))::real,
    COALESCE(cs.affinity, 0)::real,
    COALESCE(ts.popularity, 0)::real,
    COALESCE(co.reader_count, 0)::int,
    (CASE
      WHEN COALESCE(co.collab_score, 0) > 0.5 THEN 'leitores parecidos com você gostaram'
      WHEN COALESCE(cs.affinity, 0) > 0.5 THEN 'do gênero que você curte'
      WHEN COALESCE(sb.boost, 0) > 0 THEN 'baseado no que você buscou'
      ELSE 'em alta agora'
    END)::text
  FROM public.books b
  LEFT JOIN content_scored cs ON cs.book_id = b.id
  LEFT JOIN trending_scored ts ON ts.book_id = b.id
  LEFT JOIN collab co ON co.book_id = b.id
  LEFT JOIN search_boost sb ON sb.book_id = b.id
  WHERE b.content_type = ANY(v_prefs)
    AND b.id NOT IN (SELECT s.book_id FROM seen s WHERE s.book_id IS NOT NULL)
    AND (COALESCE(cs.affinity,0) > 0 OR COALESCE(ts.popularity,0) > 0
         OR COALESCE(co.collab_score,0) > 0 OR COALESCE(sb.boost,0) > 0)
  ORDER BY 2 DESC NULLS LAST
  LIMIT _limit;
END $function$;