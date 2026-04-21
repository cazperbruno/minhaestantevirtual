CREATE OR REPLACE FUNCTION public.weekly_league_for_user(_user_id uuid)
RETURNS TABLE(
  division text,
  division_label text,
  weekly_xp integer,
  position_global integer,
  position_in_division integer,
  total_in_division integer,
  promotion_threshold integer,
  demotion_threshold integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_xp integer := 0;
  v_div text;
  v_label text;
  v_promo integer;
  v_demo integer;
  v_pos_global integer;
  v_pos_div integer;
  v_total_div integer;
BEGIN
  SELECT COALESCE(weekly_xp, 0), COALESCE(position, 0)
    INTO v_xp, v_pos_global
  FROM public.weekly_ranking_view
  WHERE id = _user_id;

  IF v_xp >= 700 THEN
    v_div := 'diamond';   v_label := 'Diamante';  v_promo := 0;    v_demo := 700;
  ELSIF v_xp >= 350 THEN
    v_div := 'platinum';  v_label := 'Platina';   v_promo := 700;  v_demo := 350;
  ELSIF v_xp >= 150 THEN
    v_div := 'gold';      v_label := 'Ouro';      v_promo := 350;  v_demo := 150;
  ELSIF v_xp >= 50 THEN
    v_div := 'silver';    v_label := 'Prata';     v_promo := 150;  v_demo := 50;
  ELSE
    v_div := 'bronze';    v_label := 'Bronze';    v_promo := 50;   v_demo := 0;
  END IF;

  WITH same_div AS (
    SELECT id, weekly_xp, ROW_NUMBER() OVER (ORDER BY weekly_xp DESC, id) AS rn
    FROM public.weekly_ranking_view
    WHERE
      CASE
        WHEN v_div = 'diamond'  THEN weekly_xp >= 700
        WHEN v_div = 'platinum' THEN weekly_xp >= 350 AND weekly_xp < 700
        WHEN v_div = 'gold'     THEN weekly_xp >= 150 AND weekly_xp < 350
        WHEN v_div = 'silver'   THEN weekly_xp >= 50  AND weekly_xp < 150
        ELSE weekly_xp < 50
      END
  )
  SELECT rn::int, COUNT(*) OVER ()::int
    INTO v_pos_div, v_total_div
  FROM same_div
  WHERE id = _user_id
  LIMIT 1;

  RETURN QUERY SELECT v_div, v_label, v_xp, COALESCE(v_pos_global, 0),
                      COALESCE(v_pos_div, 0), COALESCE(v_total_div, 0),
                      v_promo, v_demo;
END $$;

CREATE OR REPLACE FUNCTION public.division_from_xp(_xp integer)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _xp >= 700 THEN 'diamond'
    WHEN _xp >= 350 THEN 'platinum'
    WHEN _xp >= 150 THEN 'gold'
    WHEN _xp >= 50  THEN 'silver'
    ELSE 'bronze'
  END;
$$;

INSERT INTO public.challenge_templates (code, title, description, icon, category, metric, target, weight, xp_reward, tags)
VALUES
  ('seasonal_halloween_terror',  'Noite do Terror 🎃',           'Leia 1 livro de suspense ou terror',         '🎃', 'weekly', 'books_read_category', 1, 5, 200, ARRAY['seasonal','halloween','october']),
  ('seasonal_halloween_marathon','Maratona Sombria 🦇',           'Leia 100 páginas em uma única noite',        '🦇', 'weekly', 'pages_in_day',        100, 4, 150, ARRAY['seasonal','halloween','october']),
  ('seasonal_xmas_gift',         'Presente Literário 🎁',         'Recomende 3 livros para amigos',             '🎁', 'weekly', 'recommendations_made', 3, 5, 200, ARRAY['seasonal','christmas','december']),
  ('seasonal_xmas_finish',       'Fim de Ano com Chave de Ouro ✨','Termine 2 livros antes do ano acabar',      '✨', 'weekly', 'books_finished',       2, 5, 250, ARRAY['seasonal','christmas','december']),
  ('seasonal_newyear_start',     'Resolução de Leitura 📅',       'Comece 3 livros novos',                      '📅', 'weekly', 'books_started',        3, 5, 200, ARRAY['seasonal','newyear','january']),
  ('seasonal_lovers_romance',    'Romance em Junho 💕',           'Leia 1 livro de romance',                    '💕', 'weekly', 'books_read_category',  1, 4, 150, ARRAY['seasonal','lovers','june']),
  ('seasonal_carnival_diversity','Folia Literária 🎭',            'Leia livros de 3 gêneros diferentes',        '🎭', 'weekly', 'genres_diversity',     3, 4, 180, ARRAY['seasonal','carnival','february','march']),
  ('seasonal_winter_cozy',       'Inverno Aconchegante ☕',       'Leia 5 dias seguidos',                       '☕', 'weekly', 'streak_days',          5, 4, 180, ARRAY['seasonal','winter','july'])
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  xp_reward = EXCLUDED.xp_reward,
  tags = EXCLUDED.tags;

CREATE OR REPLACE FUNCTION public.active_seasonal_challenges()
RETURNS SETOF public.challenge_templates
LANGUAGE sql STABLE
AS $$
  SELECT ct.*
  FROM public.challenge_templates ct
  WHERE 'seasonal' = ANY(ct.tags)
    AND LOWER(TRIM(TO_CHAR(CURRENT_DATE, 'month'))) = ANY(ct.tags)
  ORDER BY ct.weight DESC, ct.code;
$$;