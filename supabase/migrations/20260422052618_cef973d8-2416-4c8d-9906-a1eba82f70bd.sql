-- ===========================================================
-- Fase 2 — Retenção: Caixa Surpresa Diária + Cohort Retention
-- ===========================================================

-- 1) Tabela de claims (1 caixa/dia por usuário)
CREATE TABLE IF NOT EXISTS public.daily_surprise_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  claim_date date NOT NULL,
  book_id uuid,
  bonus_xp int NOT NULL DEFAULT 0,
  rarity text NOT NULL DEFAULT 'common', -- common | rare | epic | legendary
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_surprise_claims_user
  ON public.daily_surprise_claims (user_id, claim_date DESC);

ALTER TABLE public.daily_surprise_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dsc_select_own"
  ON public.daily_surprise_claims FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT só via RPC (security definer) — bloqueia direto
CREATE POLICY "dsc_no_direct_insert"
  ON public.daily_surprise_claims FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- 2) Função: abrir a caixa
-- Retorna book_id, bonus_xp, rarity, already_claimed_today
CREATE OR REPLACE FUNCTION public.open_daily_surprise_box()
RETURNS TABLE(
  book_id uuid,
  bonus_xp int,
  rarity text,
  already_claimed boolean,
  claim_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _existing public.daily_surprise_claims%ROWTYPE;
  _picked_book uuid;
  _roll numeric;
  _rarity text;
  _bonus int;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Já abriu hoje?
  SELECT * INTO _existing
  FROM public.daily_surprise_claims
  WHERE user_id = _user_id AND claim_date = _today;

  IF FOUND THEN
    RETURN QUERY SELECT _existing.book_id, _existing.bonus_xp, _existing.rarity, TRUE, _existing.claim_date;
    RETURN;
  END IF;

  -- Escolhe 1 livro do top-30 personalizado, fora da biblioteca do usuário
  SELECT r.id INTO _picked_book
  FROM public.recommend_for_user(_user_id, 30) r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_books ub
    WHERE ub.user_id = _user_id AND ub.book_id = r.id
  )
  ORDER BY random()
  LIMIT 1;

  -- Fallback: livro aleatório com cover
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

  -- Roleta de raridade (bonus XP variável — recompensa variável)
  -- 60% common (5xp) | 25% rare (15xp) | 12% epic (40xp) | 3% legendary (100xp)
  _roll := random();
  IF _roll < 0.60 THEN
    _rarity := 'common';   _bonus := 5;
  ELSIF _roll < 0.85 THEN
    _rarity := 'rare';     _bonus := 15;
  ELSIF _roll < 0.97 THEN
    _rarity := 'epic';     _bonus := 40;
  ELSE
    _rarity := 'legendary'; _bonus := 100;
  END IF;

  -- Persiste claim
  INSERT INTO public.daily_surprise_claims (user_id, claim_date, book_id, bonus_xp, rarity)
  VALUES (_user_id, _today, _picked_book, _bonus, _rarity);

  -- Concede o XP via add_xp (mantém histórico em xp_events)
  PERFORM public.add_xp(_user_id, _bonus, 'misc', jsonb_build_object('source', 'daily_box', 'rarity', _rarity));

  RETURN QUERY SELECT _picked_book, _bonus, _rarity, FALSE, _today;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_daily_surprise_box() TO authenticated;

-- 3) Função: status da caixa (sem abrir) — pra UI saber se está disponível
CREATE OR REPLACE FUNCTION public.daily_surprise_status()
RETURNS TABLE(available boolean, last_rarity text, last_book_id uuid, last_bonus_xp int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH today_claim AS (
    SELECT * FROM public.daily_surprise_claims
    WHERE user_id = auth.uid()
      AND claim_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    LIMIT 1
  )
  SELECT
    NOT EXISTS (SELECT 1 FROM today_claim) AS available,
    (SELECT rarity FROM today_claim)       AS last_rarity,
    (SELECT book_id FROM today_claim)      AS last_book_id,
    (SELECT bonus_xp FROM today_claim)     AS last_bonus_xp;
$$;

GRANT EXECUTE ON FUNCTION public.daily_surprise_status() TO authenticated;

-- 4) Função admin: cohort retention (D1/D7/D30)
-- Para cada semana de cadastro, % de users que voltaram a interagir
CREATE OR REPLACE FUNCTION public.cohort_retention(_weeks_back int DEFAULT 8)
RETURNS TABLE(
  cohort_week date,
  cohort_size int,
  d1_returned int,
  d7_returned int,
  d30_returned int,
  d1_pct numeric,
  d7_pct numeric,
  d30_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cohorts AS (
    SELECT
      date_trunc('week', p.created_at)::date AS cohort_week,
      p.id AS user_id,
      p.created_at::date AS signup_date
    FROM public.profiles p
    WHERE p.created_at > now() - (_weeks_back || ' weeks')::interval
  ),
  activity AS (
    SELECT
      c.cohort_week,
      c.user_id,
      c.signup_date,
      MIN(ub.updated_at::date) FILTER (WHERE ub.updated_at::date > c.signup_date) AS first_return
    FROM cohorts c
    LEFT JOIN public.user_books ub ON ub.user_id = c.user_id
    GROUP BY 1,2,3
  ),
  agg AS (
    SELECT
      cohort_week,
      COUNT(*)::int AS cohort_size,
      COUNT(*) FILTER (WHERE first_return - signup_date BETWEEN 1 AND 1)::int  AS d1_returned,
      COUNT(*) FILTER (WHERE first_return - signup_date BETWEEN 1 AND 7)::int  AS d7_returned,
      COUNT(*) FILTER (WHERE first_return - signup_date BETWEEN 1 AND 30)::int AS d30_returned
    FROM activity
    GROUP BY 1
  )
  SELECT
    cohort_week,
    cohort_size,
    d1_returned,
    d7_returned,
    d30_returned,
    ROUND((d1_returned::numeric  / NULLIF(cohort_size,0)) * 100, 1) AS d1_pct,
    ROUND((d7_returned::numeric  / NULLIF(cohort_size,0)) * 100, 1) AS d7_pct,
    ROUND((d30_returned::numeric / NULLIF(cohort_size,0)) * 100, 1) AS d30_pct
  FROM agg
  ORDER BY cohort_week DESC;
$$;

-- Restrita: chamada via verificação de admin no client
GRANT EXECUTE ON FUNCTION public.cohort_retention(int) TO authenticated;

-- 5) Função admin: DAU/WAU/MAU snapshot (sticky factor = DAU/MAU)
CREATE OR REPLACE FUNCTION public.engagement_snapshot()
RETURNS TABLE(dau int, wau int, mau int, sticky_pct numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH d AS (
    SELECT COUNT(DISTINCT user_id)::int AS c
    FROM public.user_books
    WHERE updated_at > now() - interval '1 day'
  ),
  w AS (
    SELECT COUNT(DISTINCT user_id)::int AS c
    FROM public.user_books
    WHERE updated_at > now() - interval '7 days'
  ),
  m AS (
    SELECT COUNT(DISTINCT user_id)::int AS c
    FROM public.user_books
    WHERE updated_at > now() - interval '30 days'
  )
  SELECT
    d.c, w.c, m.c,
    ROUND((d.c::numeric / NULLIF(m.c,0)) * 100, 1)
  FROM d, w, m;
$$;

GRANT EXECUTE ON FUNCTION public.engagement_snapshot() TO authenticated;