-- READIFY P0 — convite individual deve sempre pertencer ao usuário autenticado.

CREATE OR REPLACE FUNCTION public.ensure_invite(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE existing text; new_code text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT code INTO existing FROM public.invites WHERE user_id = _user_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  LOOP
    new_code := UPPER(SUBSTRING(MD5(RANDOM()::text || _user_id::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.invites WHERE code = new_code);
  END LOOP;

  INSERT INTO public.invites (user_id, code) VALUES (_user_id, new_code);
  RETURN new_code;
END $$;

REVOKE ALL ON FUNCTION public.ensure_invite(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_invite(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_invite(uuid) TO authenticated;
