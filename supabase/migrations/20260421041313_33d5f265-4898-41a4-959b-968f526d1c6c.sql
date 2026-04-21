CREATE OR REPLACE FUNCTION public.weekly_league_for_user(_user_id uuid)
RETURNS TABLE (
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
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekly_xp integer := 0;
  v_position integer := 0;
  v_division text;
  v_division_label text;
  v_promotion integer;
  v_demotion integer;
  v_position_in_div integer := 0;
  v_total_in_div integer := 0;
BEGIN
  -- XP semanal e posição global do usuário
  SELECT COALESCE(wrv.weekly_xp, 0)::integer, COALESCE(wrv.position, 0)::integer
    INTO v_weekly_xp, v_position
  FROM public.weekly_ranking_view wrv
  WHERE wrv.id = _user_id;

  -- Divisão a partir do XP
  v_division := public.division_from_xp(v_weekly_xp);

  v_division_label := CASE v_division
    WHEN 'bronze' THEN 'Bronze'
    WHEN 'silver' THEN 'Prata'
    WHEN 'gold' THEN 'Ouro'
    WHEN 'platinum' THEN 'Platina'
    WHEN 'diamond' THEN 'Diamante'
    ELSE 'Bronze'
  END;

  v_promotion := CASE v_division
    WHEN 'bronze' THEN 100
    WHEN 'silver' THEN 300
    WHEN 'gold' THEN 700
    WHEN 'platinum' THEN 1500
    ELSE 1500
  END;

  v_demotion := CASE v_division
    WHEN 'silver' THEN 100
    WHEN 'gold' THEN 300
    WHEN 'platinum' THEN 700
    WHEN 'diamond' THEN 1500
    ELSE 0
  END;

  -- Total de jogadores na divisão e posição relativa
  SELECT COUNT(*)::integer
    INTO v_total_in_div
  FROM public.weekly_ranking_view wrv
  WHERE public.division_from_xp(COALESCE(wrv.weekly_xp, 0)::integer) = v_division;

  SELECT COUNT(*)::integer + 1
    INTO v_position_in_div
  FROM public.weekly_ranking_view wrv
  WHERE public.division_from_xp(COALESCE(wrv.weekly_xp, 0)::integer) = v_division
    AND COALESCE(wrv.weekly_xp, 0) > v_weekly_xp;

  RETURN QUERY SELECT
    v_division,
    v_division_label,
    v_weekly_xp,
    v_position,
    v_position_in_div,
    v_total_in_div,
    v_promotion,
    v_demotion;
END;
$$;