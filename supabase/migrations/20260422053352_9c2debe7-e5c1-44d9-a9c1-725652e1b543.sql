-- =====================================================================
-- FASE 3 — Loops competitivos avançados + telemetria de profundidade
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) FINALÍSTICA DA LIGA SEMANAL
-- Cria notificação para usuários ativos na liga, no domingo à noite,
-- avisando posição e quantos XP faltam pra subir / risco de cair.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_league_finale_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _created int := 0;
  _row record;
  _title text;
  _body text;
BEGIN
  FOR _row IN
    SELECT
      wlv.id AS user_id,
      wlv.weekly_xp,
      wlv.position_in_division,
      wlv.total_in_division,
      wlv.division_label,
      wlv.promotion_threshold,
      wlv.demotion_threshold
    FROM public.weekly_league_view wlv
    WHERE wlv.weekly_xp >= 10
  LOOP
    -- Anti-spam: pula se já enviou finalística da liga nos últimos 5 dias
    IF EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = _row.user_id
        AND n.kind = 'league_finale'
        AND n.created_at > now() - interval '5 days'
    ) THEN
      CONTINUE;
    END IF;

    -- Constrói mensagem por contexto
    IF _row.position_in_division <= 3 AND _row.promotion_threshold > 0 THEN
      _title := '🏆 Você pode subir de divisão!';
      _body := format(
        'Final da liga %s — você está em %s°. Faltam %s XP pra garantir a promoção. Bora!',
        _row.division_label, _row.position_in_division,
        GREATEST(_row.promotion_threshold - _row.weekly_xp, 0)
      );
    ELSIF _row.demotion_threshold > 0 AND _row.weekly_xp < _row.demotion_threshold THEN
      _title := '⚠️ Sua divisão está em risco';
      _body := format(
        'Final da liga %s — %s XP te separam da zona segura. Leia agora pra não cair!',
        _row.division_label,
        GREATEST(_row.demotion_threshold - _row.weekly_xp, 0)
      );
    ELSE
      _title := '🔥 Reta final da liga';
      _body := format(
        'Você está em %s° na %s. Cada XP conta — algumas horas pra subir!',
        _row.position_in_division, _row.division_label
      );
    END IF;

    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    VALUES (
      _row.user_id,
      'league_finale',
      _title,
      _body,
      '/ranking',
      jsonb_build_object(
        'division', _row.division_label,
        'position', _row.position_in_division,
        'weekly_xp', _row.weekly_xp
      )
    );

    _created := _created + 1;
  END LOOP;

  RETURN _created;
END;
$$;

-- ---------------------------------------------------------------------
-- 2) CAIXA SURPRESA ÉPICA DE SÁBADO
-- Sobrescreve open_daily_surprise_box com odds melhoradas aos sábados.
-- (sábado = dow 6 em America/Sao_Paulo)
-- Distribuição normal:    60/25/12/3   (common/rare/epic/legendary)
-- Distribuição sábado:    35/30/25/10  → muito mais chance de épico/lendário
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_daily_surprise_box()
RETURNS TABLE(book_id uuid, bonus_xp integer, rarity text, already_claimed boolean, claim_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _now_brt timestamptz := now() AT TIME ZONE 'America/Sao_Paulo';
  _today date := _now_brt::date;
  _is_saturday boolean := EXTRACT(DOW FROM _now_brt) = 6;
  _existing public.daily_surprise_claims%ROWTYPE;
  _picked_book uuid;
  _roll numeric;
  _rarity text;
  _bonus int;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO _existing
  FROM public.daily_surprise_claims
  WHERE user_id = _user_id AND claim_date = _today;

  IF FOUND THEN
    RETURN QUERY SELECT _existing.book_id, _existing.bonus_xp, _existing.rarity, TRUE, _existing.claim_date;
    RETURN;
  END IF;

  -- Pool de candidatos: top recomendado fora da biblioteca
  SELECT r.id INTO _picked_book
  FROM public.recommend_for_user(_user_id, 30) r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_books ub
    WHERE ub.user_id = _user_id AND ub.book_id = r.id
  )
  ORDER BY random()
  LIMIT 1;

  IF _picked_book IS NULL THEN
    SELECT b.id INTO _picked_book
    FROM public.books b
    WHERE b.cover_url IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_books ub
        WHERE ub.user_id = _user_id AND ub.book_id = b.id
      )
    ORDER BY random()
    LIMIT 1;
  END IF;

  _roll := random();

  IF _is_saturday THEN
    -- Sábado épico: 35% common / 30% rare / 25% epic / 10% legendary
    IF _roll < 0.35 THEN
      _rarity := 'common';   _bonus := 10;   -- bônus base também sobe
    ELSIF _roll < 0.65 THEN
      _rarity := 'rare';     _bonus := 25;
    ELSIF _roll < 0.90 THEN
      _rarity := 'epic';     _bonus := 60;
    ELSE
      _rarity := 'legendary'; _bonus := 150;
    END IF;
  ELSE
    -- Distribuição padrão dos outros dias
    IF _roll < 0.60 THEN
      _rarity := 'common';   _bonus := 5;
    ELSIF _roll < 0.85 THEN
      _rarity := 'rare';     _bonus := 15;
    ELSIF _roll < 0.97 THEN
      _rarity := 'epic';     _bonus := 40;
    ELSE
      _rarity := 'legendary'; _bonus := 100;
    END IF;
  END IF;

  INSERT INTO public.daily_surprise_claims (user_id, claim_date, book_id, bonus_xp, rarity)
  VALUES (_user_id, _today, _picked_book, _bonus, _rarity);

  PERFORM public.add_xp(
    _user_id, _bonus, 'misc',
    jsonb_build_object('source', 'daily_box', 'rarity', _rarity, 'saturday_boost', _is_saturday)
  );

  RETURN QUERY SELECT _picked_book, _bonus, _rarity, FALSE, _today;
END;
$$;

-- Helper pra UI saber se hoje é sábado-épico (BRT) sem expor lógica
CREATE OR REPLACE FUNCTION public.is_epic_saturday()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Sao_Paulo')) = 6;
$$;

-- ---------------------------------------------------------------------
-- 3) TELEMETRIA DE PROFUNDIDADE
-- Índices pra acelerar agregações por evento e por dia em app_events.
-- (a tabela já existe e a inserção é feita pelo helper trackEvent)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_app_events_event_created
  ON public.app_events (event, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_events_user_event_created
  ON public.app_events (user_id, event, created_at DESC);

-- View agregada de eventos de profundidade — DAU por evento últimos 14 dias
CREATE OR REPLACE VIEW public.engagement_depth_daily AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
  event,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(*) AS total_events
FROM public.app_events
WHERE created_at > now() - interval '30 days'
  AND event IN (
    'book_opened',
    'reading_session_logged',
    'review_shared',
    'feed_scrolled_deep',
    'shelf_explored',
    'surprise_box_opened',
    'league_viewed'
  )
GROUP BY 1, 2;

-- RPC pra ReportsPage consumir
CREATE OR REPLACE FUNCTION public.engagement_depth_summary(_days int DEFAULT 14)
RETURNS TABLE(event text, unique_users bigint, total_events bigint, avg_per_user numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.event,
    COUNT(DISTINCT e.user_id)::bigint AS unique_users,
    COUNT(*)::bigint AS total_events,
    ROUND((COUNT(*)::numeric / NULLIF(COUNT(DISTINCT e.user_id), 0)), 2) AS avg_per_user
  FROM public.app_events e
  WHERE e.created_at > now() - (_days || ' days')::interval
    AND e.event IN (
      'book_opened',
      'reading_session_logged',
      'review_shared',
      'feed_scrolled_deep',
      'shelf_explored',
      'surprise_box_opened',
      'league_viewed'
    )
  GROUP BY e.event
  ORDER BY unique_users DESC;
$$;

REVOKE ALL ON FUNCTION public.engagement_depth_summary(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engagement_depth_summary(int) TO authenticated;
