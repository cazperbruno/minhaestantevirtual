-- READIFY P0 — preserve the trusted service-role challenge worker without
-- reopening client-side cross-user access.

CREATE OR REPLACE FUNCTION public.assign_daily_challenges(_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  daily_count int; weekly_count int; epic_count int;
  inserted int := 0; tpl record; expire_at timestamptz;
  is_service boolean := COALESCE(auth.jwt()->>'role', '') = 'service_role';
BEGIN
  IF NOT is_service AND (auth.uid() IS NULL OR auth.uid() <> _user_id) THEN
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

CREATE OR REPLACE FUNCTION public.recompute_challenge_progress(_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ch record; new_progress int; updated_count int := 0;
  is_service boolean := COALESCE(auth.jwt()->>'role', '') = 'service_role';
BEGIN
  IF NOT is_service AND (auth.uid() IS NULL OR auth.uid() <> _user_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  FOR ch IN
    SELECT uc.*, ct.metric
    FROM public.user_challenges uc
    JOIN public.challenge_templates ct ON ct.code = uc.template_code
    WHERE uc.user_id = _user_id AND uc.status = 'active' AND uc.expires_at > now()
  LOOP
    new_progress := CASE ch.metric
      WHEN 'add_book' THEN (SELECT COUNT(*)::int FROM public.user_books WHERE user_id = _user_id AND created_at >= ch.created_at)
      WHEN 'finish_book' THEN (SELECT COUNT(*)::int FROM public.user_books WHERE user_id = _user_id AND status = 'read' AND finished_at >= ch.created_at)
      WHEN 'rate_book' THEN (SELECT COUNT(*)::int FROM public.user_books WHERE user_id = _user_id AND rating IS NOT NULL AND updated_at >= ch.created_at)
      WHEN 'scan_book' THEN (SELECT COUNT(*)::int FROM public.user_interactions WHERE user_id = _user_id AND kind = 'scan' AND created_at >= ch.created_at)
      WHEN 'like_review' THEN (SELECT COUNT(*)::int FROM public.review_likes WHERE user_id = _user_id AND created_at >= ch.created_at)
      WHEN 'comment_review' THEN (SELECT COUNT(*)::int FROM public.review_comments WHERE user_id = _user_id AND created_at >= ch.created_at)
      WHEN 'write_review' THEN (SELECT COUNT(*)::int FROM public.reviews WHERE user_id = _user_id AND created_at >= ch.created_at)
      WHEN 'follow' THEN (SELECT COUNT(*)::int FROM public.follows WHERE follower_id = _user_id AND created_at >= ch.created_at)
      WHEN 'club_message' THEN (SELECT COUNT(*)::int FROM public.club_messages WHERE user_id = _user_id AND created_at >= ch.created_at)
      WHEN 'loan_book' THEN (SELECT COUNT(*)::int FROM public.loans WHERE user_id = _user_id AND created_at >= ch.created_at)
      WHEN 'open_app' THEN ch.progress
      ELSE ch.progress
    END;

    IF new_progress <> ch.progress OR (new_progress >= ch.target AND ch.status = 'active') THEN
      UPDATE public.user_challenges
      SET progress = LEAST(new_progress, ch.target),
          status = CASE WHEN new_progress >= ch.target THEN 'completed' ELSE 'active' END,
          completed_at = CASE WHEN new_progress >= ch.target AND completed_at IS NULL THEN now() ELSE completed_at END
      WHERE id = ch.id;
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  UPDATE public.user_challenges
  SET status = 'expired'
  WHERE user_id = _user_id AND status = 'active' AND expires_at <= now();

  RETURN updated_count;
END $$;

REVOKE ALL ON FUNCTION public.assign_daily_challenges(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_challenge_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_daily_challenges(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_challenge_progress(uuid) TO authenticated, service_role;
