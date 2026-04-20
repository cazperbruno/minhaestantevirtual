-- =========================================================
-- Onda IA 8 — Sistema de aprendizado contínuo (sem custo)
-- =========================================================

-- 1) Tabela user_weights — pesos personalizados por usuário (auto-ajustáveis)
CREATE TABLE IF NOT EXISTS public.user_weights (
  user_id uuid PRIMARY KEY,
  w_collab real NOT NULL DEFAULT 0.5,
  w_content real NOT NULL DEFAULT 0.3,
  w_trending real NOT NULL DEFAULT 0.2,
  -- Métricas de feedback (CTR das próprias recomendações)
  recs_shown int NOT NULL DEFAULT 0,
  recs_clicked int NOT NULL DEFAULT 0,
  recs_dismissed int NOT NULL DEFAULT 0,
  last_recomputed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weights_select_own" ON public.user_weights
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "weights_insert_own" ON public.user_weights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "weights_update_own" ON public.user_weights
  FOR UPDATE USING (auth.uid() = user_id);

-- 2) Índice de performance em user_interactions (consultado em todo recompute)
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_kind_created
  ON public.user_interactions (user_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_interactions_book_created
  ON public.user_interactions (book_id, created_at DESC);

-- 3) Função: registrar visualização de livro (deduplica por hora)
CREATE OR REPLACE FUNCTION public.track_book_view(_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR _book_id IS NULL THEN RETURN; END IF;
  -- Deduplica: só registra view se a última view do mesmo livro foi >1h atrás
  IF NOT EXISTS (
    SELECT 1 FROM public.user_interactions
    WHERE user_id = v_uid AND book_id = _book_id AND kind = 'view'
      AND created_at > now() - interval '1 hour'
  ) THEN
    INSERT INTO public.user_interactions (user_id, book_id, kind, weight)
    VALUES (v_uid, _book_id, 'view', 0.5);
  END IF;
END $$;

-- 4) Função: registrar dismiss de recomendação (sinal negativo)
CREATE OR REPLACE FUNCTION public.track_book_dismiss(_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR _book_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_interactions (user_id, book_id, kind, weight)
  VALUES (v_uid, _book_id, 'dismiss', -2.0);
  -- Conta no feedback de pesos
  INSERT INTO public.user_weights (user_id, recs_dismissed, recs_shown)
  VALUES (v_uid, 1, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET recs_dismissed = public.user_weights.recs_dismissed + 1,
        recs_shown = public.user_weights.recs_shown + 1,
        updated_at = now();
END $$;

-- 5) Função: registrar busca (sinal de interesse temporário)
CREATE OR REPLACE FUNCTION public.track_search(_query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR _query IS NULL OR length(trim(_query)) < 2 THEN RETURN; END IF;
  -- Salva como interaction sem book_id, em meta
  -- (book_id é NOT NULL na tabela, então usamos uma estratégia diferente: log em xp_events com source='search_event' amount=0)
  -- Alternativa: criar tabela search_log
  NULL;
END $$;

-- 6) Tabela search_log — buscas recentes do usuário (boost por 7 dias)
CREATE TABLE IF NOT EXISTS public.search_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  query text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.search_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "search_log_select_own" ON public.search_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "search_log_insert_own" ON public.search_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "search_log_delete_own" ON public.search_log
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_search_log_user_created
  ON public.search_log (user_id, created_at DESC);

-- 7) Reescreve track_search para usar a nova tabela
CREATE OR REPLACE FUNCTION public.track_search(_query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR _query IS NULL OR length(trim(_query)) < 2 THEN RETURN; END IF;
  INSERT INTO public.search_log (user_id, query)
  VALUES (v_uid, lower(trim(_query)));
  -- Limpeza: manter só últimas 100 buscas por usuário
  DELETE FROM public.search_log
  WHERE user_id = v_uid
    AND id NOT IN (
      SELECT id FROM public.search_log
      WHERE user_id = v_uid
      ORDER BY created_at DESC LIMIT 100
    );
END $$;

-- 8) Função: contabilizar clique em recomendação (CTR positivo)
CREATE OR REPLACE FUNCTION public.track_rec_click(_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR _book_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_interactions (user_id, book_id, kind, weight)
  VALUES (v_uid, _book_id, 'rec_click', 1.0);
  INSERT INTO public.user_weights (user_id, recs_clicked, recs_shown)
  VALUES (v_uid, 1, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET recs_clicked = public.user_weights.recs_clicked + 1,
        recs_shown = public.user_weights.recs_shown + 1,
        updated_at = now();
END $$;

-- 9) Função: registrar exibição de N recomendações (sem clique ainda)
CREATE OR REPLACE FUNCTION public.track_recs_shown(_count int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR _count IS NULL OR _count <= 0 THEN RETURN; END IF;
  INSERT INTO public.user_weights (user_id, recs_shown)
  VALUES (v_uid, _count)
  ON CONFLICT (user_id) DO UPDATE
    SET recs_shown = public.user_weights.recs_shown + _count,
        updated_at = now();
END $$;

-- 10) Função: auto-ajuste de pesos baseado em CTR e histórico
-- Lógica:
--   - Se CTR > 15%: pesos atuais funcionam, manter
--   - Se CTR < 5% E há twins: aumentar w_collab, diminuir w_trending
--   - Se CTR < 5% E não há twins: aumentar w_content, diminuir w_trending
--   - Se dismiss_rate > 30%: diminuir w_trending (usuário rejeita populares)
CREATE OR REPLACE FUNCTION public.recompute_user_weights(_user_id uuid)
RETURNS TABLE(w_collab real, w_content real, w_trending real, ctr real)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uw record;
  v_ctr real;
  v_dismiss_rate real;
  has_twins boolean;
  new_collab real := 0.5;
  new_content real := 0.3;
  new_trending real := 0.2;
BEGIN
  SELECT * INTO uw FROM public.user_weights WHERE user_id = _user_id;
  IF uw IS NULL THEN
    INSERT INTO public.user_weights (user_id) VALUES (_user_id);
    RETURN QUERY SELECT 0.5::real, 0.3::real, 0.2::real, 0::real;
    RETURN;
  END IF;

  -- Precisa de amostra mínima
  IF uw.recs_shown < 20 THEN
    RETURN QUERY SELECT uw.w_collab, uw.w_content, uw.w_trending, 0::real;
    RETURN;
  END IF;

  v_ctr := uw.recs_clicked::real / GREATEST(uw.recs_shown, 1)::real;
  v_dismiss_rate := uw.recs_dismissed::real / GREATEST(uw.recs_shown, 1)::real;
  SELECT EXISTS (SELECT 1 FROM public.get_similar_users(_user_id) LIMIT 1) INTO has_twins;

  -- Caso 1: bom CTR — manter pesos atuais
  IF v_ctr >= 0.15 THEN
    new_collab := uw.w_collab;
    new_content := uw.w_content;
    new_trending := uw.w_trending;
  -- Caso 2: CTR ruim — ajustar
  ELSIF v_ctr < 0.05 THEN
    IF has_twins THEN
      new_collab := 0.6;
      new_content := 0.3;
      new_trending := 0.1;
    ELSE
      new_collab := 0.0;
      new_content := 0.75;
      new_trending := 0.25;
    END IF;
  ELSE
    -- CTR mediano — leve ajuste em direção ao conteúdo
    new_collab := CASE WHEN has_twins THEN 0.45 ELSE 0.0 END;
    new_content := CASE WHEN has_twins THEN 0.4 ELSE 0.7 END;
    new_trending := CASE WHEN has_twins THEN 0.15 ELSE 0.3 END;
  END IF;

  -- Penalidade extra: se usuário rejeita muito, baixa trending
  IF v_dismiss_rate > 0.3 THEN
    new_trending := GREATEST(0.05, new_trending - 0.1);
    new_content := LEAST(0.85, new_content + 0.1);
  END IF;

  UPDATE public.user_weights
    SET w_collab = new_collab,
        w_content = new_content,
        w_trending = new_trending,
        last_recomputed_at = now(),
        updated_at = now()
    WHERE user_id = _user_id;

  RETURN QUERY SELECT new_collab, new_content, new_trending, v_ctr;
END $$;

-- 11) Reescreve recommend_for_user para usar pesos personalizados
CREATE OR REPLACE FUNCTION public.recommend_for_user(_user_id uuid, _limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, affinity real, popularity real, score real, reason text, collab_readers integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  has_twins boolean;
  w_collab real;
  w_content real;
  w_trending real;
  uw record;
BEGIN
  -- Carrega pesos personalizados (se existirem)
  SELECT * INTO uw FROM public.user_weights WHERE user_id = _user_id;

  IF uw IS NOT NULL AND uw.recs_shown >= 20 THEN
    -- Usa pesos auto-ajustados
    w_collab := uw.w_collab;
    w_content := uw.w_content;
    w_trending := uw.w_trending;
  ELSE
    -- Cold-start: lógica padrão
    SELECT EXISTS (SELECT 1 FROM public.get_similar_users(_user_id) LIMIT 1) INTO has_twins;
    IF has_twins THEN
      w_collab := 0.5; w_content := 0.3; w_trending := 0.2;
    ELSE
      w_collab := 0.0; w_content := 0.6; w_trending := 0.4;
    END IF;
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
  -- NOVO: termos de busca recentes (últimos 7 dias) viram boost de afinidade
  recent_searches AS (
    SELECT DISTINCT lower(trim(query)) AS q
    FROM public.search_log
    WHERE user_id = _user_id AND created_at > now() - interval '7 days'
    LIMIT 20
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
        END
      -- NOVO: boost se busca recente bate no título/autor/categoria
      + COALESCE((
          SELECT COUNT(*) * 4.0 FROM recent_searches rs
          WHERE lower(b.title) LIKE '%' || rs.q || '%'
             OR EXISTS (SELECT 1 FROM unnest(b.authors) a WHERE lower(a) LIKE '%' || rs.q || '%')
             OR EXISTS (SELECT 1 FROM unnest(COALESCE(b.categories, ARRAY[]::text[])) c WHERE lower(c) LIKE '%' || rs.q || '%')
        ), 0)
      )::real AS affinity,
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

-- 12) Função: score de relevância para uma atividade do feed (re-rank)
-- Recebe uma activity (kind, book_id, categories do livro) e retorna score
CREATE OR REPLACE FUNCTION public.activity_relevance(
  _user_id uuid,
  _activity_user uuid,
  _book_id uuid,
  _kind text,
  _created_at timestamptz
)
RETURNS real
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_taste_score real := 0;
  v_recency real;
  v_kind_weight real;
  v_follow_boost real := 0;
  hours_old real;
BEGIN
  -- 1) Recency: decay exponencial (meia-vida ~24h)
  hours_old := EXTRACT(EPOCH FROM (now() - _created_at)) / 3600.0;
  v_recency := EXP(-hours_old / 24.0)::real;

  -- 2) Peso do tipo de atividade
  v_kind_weight := CASE _kind
    WHEN 'book_finished' THEN 1.5
    WHEN 'book_recommended' THEN 1.4
    WHEN 'book_rated' THEN 1.2
    WHEN 'book_added' THEN 1.0
    WHEN 'started_following' THEN 0.5
    WHEN 'trade_completed' THEN 0.8
    ELSE 0.7
  END;

  -- 3) Afinidade com o livro (categorias)
  IF _book_id IS NOT NULL THEN
    SELECT COALESCE(SUM(t.weight), 0)::real INTO v_taste_score
    FROM public.user_taste(_user_id) t
    JOIN public.books b ON b.id = _book_id
    WHERE t.category = ANY(COALESCE(b.categories, ARRAY[]::text[]));
    v_taste_score := LEAST(v_taste_score, 20.0); -- cap
  END IF;

  -- 4) Boost se o autor da atividade é mutuamente seguido
  IF EXISTS (
    SELECT 1 FROM public.follows f1
    JOIN public.follows f2 ON f2.follower_id = f1.following_id AND f2.following_id = f1.follower_id
    WHERE f1.follower_id = _user_id AND f1.following_id = _activity_user
  ) THEN
    v_follow_boost := 1.5;
  END IF;

  RETURN (v_recency * v_kind_weight * (1.0 + v_taste_score * 0.05) * (1.0 + v_follow_boost))::real;
END $$;
