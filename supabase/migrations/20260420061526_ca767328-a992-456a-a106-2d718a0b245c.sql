-- 1) Enum
DO $$ BEGIN
  CREATE TYPE public.content_type AS ENUM ('book', 'manga', 'comic', 'magazine');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) books.content_type
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS content_type public.content_type NOT NULL DEFAULT 'book';
CREATE INDEX IF NOT EXISTS idx_books_content_type ON public.books(content_type);

-- 3) profiles.content_types
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS content_types public.content_type[] NOT NULL DEFAULT ARRAY['book']::public.content_type[];

-- 4) Tabela series
CREATE TABLE IF NOT EXISTS public.series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content_type public.content_type NOT NULL,
  authors text[] NOT NULL DEFAULT '{}',
  cover_url text,
  description text,
  total_volumes int,
  status text,
  source text,
  source_id text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS volume_number int;
CREATE INDEX IF NOT EXISTS idx_books_series_id ON public.books(series_id);

ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS series_select_all ON public.series;
CREATE POLICY series_select_all ON public.series FOR SELECT USING (true);

DROP POLICY IF EXISTS series_insert_auth ON public.series;
CREATE POLICY series_insert_auth ON public.series FOR INSERT TO authenticated
  WITH CHECK (length(title) > 0);

DROP POLICY IF EXISTS series_update_admin ON public.series;
CREATE POLICY series_update_admin ON public.series FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger func (cria se não existir)
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS update_series_updated_at ON public.series;
CREATE TRIGGER update_series_updated_at
  BEFORE UPDATE ON public.series
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5) recommend_for_user com filtro por content_type
DROP FUNCTION IF EXISTS public.recommend_for_user(uuid, integer);

CREATE FUNCTION public.recommend_for_user(_user_id uuid, _limit int DEFAULT 30)
RETURNS TABLE(
  id uuid, score real, affinity real, popularity real,
  collab_readers int, reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_w_collab real; v_w_content real; v_w_trending real;
  v_prefs public.content_type[];
BEGIN
  SELECT w_collab, w_content, w_trending
    INTO v_w_collab, v_w_content, v_w_trending
  FROM public.user_weights WHERE user_id = _user_id;
  IF v_w_collab IS NULL THEN
    v_w_collab := 0.5; v_w_content := 0.3; v_w_trending := 0.2;
  END IF;

  SELECT COALESCE(content_types, ARRAY['book']::public.content_type[])
    INTO v_prefs FROM public.profiles WHERE id = _user_id;
  IF v_prefs IS NULL OR array_length(v_prefs, 1) IS NULL THEN
    v_prefs := ARRAY['book']::public.content_type[];
  END IF;

  RETURN QUERY
  WITH user_cats AS (SELECT category, weight FROM public.user_taste(_user_id)),
  content_scored AS (
    SELECT b.id,
      COALESCE(SUM(uc.weight) FILTER (WHERE uc.category = ANY(b.categories)), 0)::real AS affinity
    FROM public.books b
    LEFT JOIN user_cats uc ON uc.category = ANY(b.categories)
    WHERE b.content_type = ANY(v_prefs)
    GROUP BY b.id
  ),
  trending_scored AS (
    SELECT tb.id, COALESCE(tb.score, 0)::real AS popularity
    FROM public.trending_books tb
    JOIN public.books b ON b.id = tb.id
    WHERE b.content_type = ANY(v_prefs)
  ),
  collab AS (
    SELECT cr.book_id AS id, cr.reader_count, cr.collab_score
    FROM public.get_collaborative_recommendations(_user_id) cr
    JOIN public.books b ON b.id = cr.book_id
    WHERE b.content_type = ANY(v_prefs)
  ),
  recent_searches AS (
    SELECT lower(query) AS q FROM public.search_log
    WHERE user_id = _user_id AND created_at > now() - interval '7 days'
  ),
  search_boost AS (
    SELECT b.id,
      CASE WHEN EXISTS (
        SELECT 1 FROM recent_searches rs
        WHERE lower(b.title) LIKE '%' || rs.q || '%'
           OR EXISTS (SELECT 1 FROM unnest(b.authors) a WHERE lower(a) LIKE '%' || rs.q || '%')
      ) THEN 1.0::real ELSE 0::real END AS boost
    FROM public.books b WHERE b.content_type = ANY(v_prefs)
  ),
  seen AS (
    SELECT book_id FROM public.user_books WHERE user_id = _user_id
    UNION
    SELECT book_id FROM public.user_interactions WHERE user_id = _user_id AND kind = 'dismiss'
  )
  SELECT b.id,
    (v_w_content * COALESCE(cs.affinity, 0)
     + v_w_collab * COALESCE(co.collab_score, 0)
     + v_w_trending * COALESCE(ts.popularity, 0)
     + 0.5 * COALESCE(sb.boost, 0))::real AS score,
    COALESCE(cs.affinity, 0)::real,
    COALESCE(ts.popularity, 0)::real,
    COALESCE(co.reader_count, 0)::int,
    CASE
      WHEN COALESCE(co.collab_score, 0) > 0.5 THEN 'leitores parecidos com você gostaram'
      WHEN COALESCE(cs.affinity, 0) > 0.5 THEN 'do gênero que você curte'
      WHEN COALESCE(sb.boost, 0) > 0 THEN 'baseado no que você buscou'
      ELSE 'em alta agora'
    END
  FROM public.books b
  LEFT JOIN content_scored cs ON cs.id = b.id
  LEFT JOIN trending_scored ts ON ts.id = b.id
  LEFT JOIN collab co ON co.id = b.id
  LEFT JOIN search_boost sb ON sb.id = b.id
  WHERE b.content_type = ANY(v_prefs)
    AND b.id NOT IN (SELECT book_id FROM seen WHERE book_id IS NOT NULL)
    AND (COALESCE(cs.affinity,0) > 0 OR COALESCE(ts.popularity,0) > 0
         OR COALESCE(co.collab_score,0) > 0 OR COALESCE(sb.boost,0) > 0)
  ORDER BY score DESC NULLS LAST
  LIMIT _limit;
END $$;

-- 6) Helper
CREATE OR REPLACE FUNCTION public.user_content_types(_user_id uuid)
RETURNS public.content_type[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(content_types, ARRAY['book']::public.content_type[])
  FROM public.profiles WHERE id = _user_id
$$;