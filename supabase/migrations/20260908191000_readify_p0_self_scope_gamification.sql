-- READIFY P0 — enforce self-scope on remaining gamification RPCs.

CREATE OR REPLACE FUNCTION public.assign_daily_challenges(_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  daily_count int; weekly_count int; epic_count int;
  inserted int := 0; tpl record; expire_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) FILTER (WHERE category='daily'),
         COUNT(*) FILTER (WHERE category='weekly'),
         COUNT(*) FILTER (WHERE category='epic')
    INTO daily_count, weekly_count, epic_count
    FROM public.user_challenges
    WHERE user_id = _user_id AND status IN ('active','completed') AND expires_at > now();

  IF daily_count < 3 THEN
    expire_at := (CURRENT_DATE + 1)::timestamptz;
    FOR tpl IN
      SELECT * FROM public.challenge_templates
      WHERE category = 'daily'
        AND code NOT IN (
          SELECT template_code FROM public.user_challenges
          WHERE user_id = _user_id AND status IN ('active','completed') AND expires_at > now()
        )
      ORDER BY weight DESC, RANDOM()
      LIMIT (3 - daily_count)
    LOOP
      INSERT INTO public.user_challenges (user_id, template_code, category, target, xp_reward, expires_at)
      VALUES (_user_id, tpl.code, 'daily', tpl.target, tpl.xp_reward, expire_at);
      inserted := inserted + 1;
    END LOOP;
  END IF;

  IF weekly_count < 3 THEN
    expire_at := (CURRENT_DATE + (7 - EXTRACT(DOW FROM CURRENT_DATE)::int))::timestamptz + interval '1 day';
    FOR tpl IN
      SELECT * FROM public.challenge_templates
      WHERE category = 'weekly'
        AND code NOT IN (
          SELECT template_code FROM public.user_challenges
          WHERE user_id = _user_id AND status IN ('active','completed') AND expires_at > now()
        )
      ORDER BY weight DESC, RANDOM()
      LIMIT (3 - weekly_count)
    LOOP
      INSERT INTO public.user_challenges (user_id, template_code, category, target, xp_reward, expires_at)
      VALUES (_user_id, tpl.code, 'weekly', tpl.target, tpl.xp_reward, expire_at);
      inserted := inserted + 1;
    END LOOP;
  END IF;

  IF epic_count < 2 THEN
    expire_at := now() + interval '60 days';
    FOR tpl IN
      SELECT * FROM public.challenge_templates
      WHERE category = 'epic'
        AND code NOT IN (
          SELECT template_code FROM public.user_challenges
          WHERE user_id = _user_id AND status IN ('active','completed','claimed')
        )
      ORDER BY weight DESC, RANDOM()
      LIMIT (2 - epic_count)
    LOOP
      INSERT INTO public.user_challenges (user_id, template_code, category, target, xp_reward, expires_at)
      VALUES (_user_id, tpl.code, 'epic', tpl.target, tpl.xp_reward, expire_at);
      inserted := inserted + 1;
    END LOOP;
  END IF;

  RETURN inserted;
END $$;

REVOKE ALL ON FUNCTION public.assign_daily_challenges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_daily_challenges(uuid) TO authenticated;

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
GRANT EXECUTE ON FUNCTION public.ensure_invite(uuid) TO authenticated;
