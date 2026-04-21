-- ============================================================
-- CAMADA DE INTELIGÊNCIA ZERO-CUSTO (SQL puro, sem IA paga)
-- ============================================================

-- 1) Tabela agregadora de sinais por livro
CREATE TABLE IF NOT EXISTS public.book_signals (
  book_id uuid PRIMARY KEY REFERENCES public.books(id) ON DELETE CASCADE,
  views_count integer NOT NULL DEFAULT 0,
  dismisses_count integer NOT NULL DEFAULT 0,
  recs_count integer NOT NULL DEFAULT 0,
  rec_clicks_count integer NOT NULL DEFAULT 0,
  reviews_count integer NOT NULL DEFAULT 0,
  avg_rating numeric(3,2),
  library_count integer NOT NULL DEFAULT 0,
  finished_count integer NOT NULL DEFAULT 0,
  popularity_score real NOT NULL DEFAULT 0,
  quality_score real NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.book_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "book_signals_select_all"
ON public.book_signals FOR SELECT
USING (true);

CREATE INDEX IF NOT EXISTS idx_book_signals_popularity
  ON public.book_signals (popularity_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_book_signals_quality
  ON public.book_signals (quality_score DESC NULLS LAST);

-- 2) Função de recálculo (idempotente, barata)
CREATE OR REPLACE FUNCTION public.recompute_book_signals(_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_views int := 0;
  v_dismisses int := 0;
  v_recs int := 0;
  v_rec_clicks int := 0;
  v_reviews int := 0;
  v_avg numeric(3,2);
  v_lib int := 0;
  v_fin int := 0;
  v_pop real := 0;
  v_qual real := 0;
BEGIN
  -- views/dismisses/clicks vêm de app_events (zero custo)
  SELECT
    COUNT(*) FILTER (WHERE event = 'book_view'),
    COUNT(*) FILTER (WHERE event = 'book_dismiss'),
    COUNT(*) FILTER (WHERE event = 'rec_click')
  INTO v_views, v_dismisses, v_rec_clicks
  FROM public.app_events
  WHERE (props->>'book_id')::uuid = _book_id
    AND created_at > now() - interval '90 days';

  SELECT COUNT(*) INTO v_recs
  FROM public.book_recommendations WHERE book_id = _book_id;

  SELECT COUNT(*), AVG(rating)::numeric(3,2)
  INTO v_reviews, v_avg
  FROM public.reviews WHERE book_id = _book_id AND rating IS NOT NULL;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'read')
  INTO v_lib, v_fin
  FROM public.user_books WHERE book_id = _book_id;

  -- Popularity: log-scale para evitar dominância de outliers
  v_pop := ln(1 + v_views) * 0.3
         + ln(1 + v_lib) * 1.0
         + ln(1 + v_recs) * 0.8
         + ln(1 + v_rec_clicks) * 0.5
         - ln(1 + v_dismisses) * 0.6;

  -- Quality: rating médio com peso por nº de reviews (Bayesian-lite)
  v_qual := COALESCE(v_avg, 3.0) * (v_reviews::real / (v_reviews + 5))
         + 3.0 * (5.0 / (v_reviews + 5));

  INSERT INTO public.book_signals (
    book_id, views_count, dismisses_count, recs_count, rec_clicks_count,
    reviews_count, avg_rating, library_count, finished_count,
    popularity_score, quality_score, updated_at
  ) VALUES (
    _book_id, v_views, v_dismisses, v_recs, v_rec_clicks,
    v_reviews, v_avg, v_lib, v_fin, v_pop, v_qual, now()
  )
  ON CONFLICT (book_id) DO UPDATE SET
    views_count = EXCLUDED.views_count,
    dismisses_count = EXCLUDED.dismisses_count,
    recs_count = EXCLUDED.recs_count,
    rec_clicks_count = EXCLUDED.rec_clicks_count,
    reviews_count = EXCLUDED.reviews_count,
    avg_rating = EXCLUDED.avg_rating,
    library_count = EXCLUDED.library_count,
    finished_count = EXCLUDED.finished_count,
    popularity_score = EXCLUDED.popularity_score,
    quality_score = EXCLUDED.quality_score,
    updated_at = now();
END;
$$;

-- 3) Recompute em lote (para o cron/standby)
CREATE OR REPLACE FUNCTION public.recompute_all_book_signals(_limit int DEFAULT 500)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT b.id
    FROM public.books b
    LEFT JOIN public.book_signals bs ON bs.book_id = b.id
    ORDER BY bs.updated_at NULLS FIRST
    LIMIT _limit
  LOOP
    PERFORM public.recompute_book_signals(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- 4) Similaridade lexical (zero IA): categorias + autor + trigram no título
CREATE OR REPLACE FUNCTION public.similar_books_lexical(
  _book_id uuid,
  _limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  score real,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cats text[];
  v_authors text[];
  v_title text;
  v_series uuid;
BEGIN
  SELECT categories, authors, title, series_id
  INTO v_cats, v_authors, v_title, v_series
  FROM public.books WHERE id = _book_id;

  IF v_title IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      b.id,
      -- Sobreposição de categorias (Jaccard simplificado)
      CASE
        WHEN v_cats IS NULL OR array_length(v_cats,1) IS NULL THEN 0
        ELSE (
          SELECT COUNT(*)::real
          FROM unnest(b.categories) c
          WHERE c = ANY(v_cats)
        ) / GREATEST(array_length(v_cats,1), 1)::real
      END AS cat_score,
      -- Mesmo autor
      CASE
        WHEN v_authors IS NULL OR array_length(v_authors,1) IS NULL THEN 0
        WHEN b.authors && v_authors THEN 1.0
        ELSE 0
      END AS author_score,
      -- Mesma série (forte sinal)
      CASE WHEN b.series_id IS NOT NULL AND b.series_id = v_series THEN 1.0 ELSE 0 END AS series_score,
      COALESCE(bs.popularity_score, 0) AS pop,
      COALESCE(bs.quality_score, 3.0) AS qual
    FROM public.books b
    LEFT JOIN public.book_signals bs ON bs.book_id = b.id
    WHERE b.id <> _book_id
      AND b.cover_url IS NOT NULL
      AND (
        b.categories && v_cats
        OR b.authors && v_authors
        OR b.series_id = v_series
      )
    LIMIT 200
  )
  SELECT
    c.id,
    (c.cat_score * 2.5 + c.author_score * 1.5 + c.series_score * 3.0
      + (c.pop / 10.0) + ((c.qual - 3.0) * 0.4))::real AS score,
    CASE
      WHEN c.series_score > 0 THEN 'Mesma série'
      WHEN c.author_score > 0 AND c.cat_score > 0 THEN 'Mesmo autor e categoria'
      WHEN c.author_score > 0 THEN 'Mesmo autor'
      WHEN c.cat_score > 0.5 THEN 'Categorias parecidas'
      ELSE 'Pode te interessar'
    END AS reason
  FROM candidates c
  WHERE (c.cat_score + c.author_score + c.series_score) > 0
  ORDER BY score DESC
  LIMIT _limit;
END;
$$;

-- 5) Cron diário em standby (gratuito — apenas SQL):
--    recalcula 500 livros mais "stale" todo dia às 04:00 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('recompute-book-signals-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recompute-book-signals-daily');
    PERFORM cron.schedule(
      'recompute-book-signals-daily',
      '0 4 * * *',
      $cron$ SELECT public.recompute_all_book_signals(500); $cron$
    );
  END IF;
END $$;