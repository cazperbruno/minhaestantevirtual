-- Corrige warning do linter: search_path mutável em is_epic_saturday
CREATE OR REPLACE FUNCTION public.is_epic_saturday()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Sao_Paulo')) = 6;
$$;