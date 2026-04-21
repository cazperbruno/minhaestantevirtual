CREATE OR REPLACE FUNCTION public.division_from_xp(_xp integer)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _xp >= 700 THEN 'diamond'
    WHEN _xp >= 350 THEN 'platinum'
    WHEN _xp >= 150 THEN 'gold'
    WHEN _xp >= 50  THEN 'silver'
    ELSE 'bronze'
  END;
$$;

CREATE OR REPLACE FUNCTION public.active_seasonal_challenges()
RETURNS SETOF public.challenge_templates
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT ct.*
  FROM public.challenge_templates ct
  WHERE 'seasonal' = ANY(ct.tags)
    AND LOWER(TRIM(TO_CHAR(CURRENT_DATE, 'month'))) = ANY(ct.tags)
  ORDER BY ct.weight DESC, ct.code;
$$;