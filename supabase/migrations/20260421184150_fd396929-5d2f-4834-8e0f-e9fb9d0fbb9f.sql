CREATE OR REPLACE FUNCTION public.extract_volume_number(title text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  m text[];
  n integer;
BEGIN
  IF title IS NULL THEN RETURN NULL; END IF;
  m := regexp_match(LOWER(title), '(?:vol(?:ume|\.+)?|tomo|tome|cap\.*|n[º°o]?\.*|#)\s*(\d{1,3})(?!\d)');
  IF m IS NOT NULL THEN
    BEGIN
      n := (m[1])::integer;
      RETURN n;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END IF;
  RETURN NULL;
END;
$$;