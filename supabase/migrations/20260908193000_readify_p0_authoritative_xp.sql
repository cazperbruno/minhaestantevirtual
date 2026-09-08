-- ============================================================
-- READIFY P0 — AUTHORITATIVE / IDEMPOTENT CLIENT XP
-- 2026-09-08
--
-- O cliente pode solicitar a avaliação de uma recompensa, mas não escolhe
-- usuário, quantidade nem a evidência. O banco procura uma ação persistida,
-- ainda não premiada, e registra reward_key idempotente em xp_events.
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_my_xp(
  _source text
)
RETURNS TABLE(
  new_xp int,
  new_level int,
  leveled_up boolean,
  awarded_amount int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  reward_key text;
  fixed_amount int;
  daily_cap int;
  awards_today int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Serializa concessões concorrentes do mesmo usuário/origem.
  PERFORM pg_advisory_xact_lock(hashtext(uid::text || ':' || COALESCE(_source, '')));

  SELECT amount, cap
    INTO fixed_amount, daily_cap
  FROM (VALUES
    ('add_book', 10, 20),
    ('finish_book', 50, 10),
    ('rate_book', 15, 20),
    ('scan_book', 8, 30),
    ('write_review', 30, 10),
    ('like_review', 2, 50),
    ('comment_review', 5, 30),
    ('follow', 5, 30),
    ('club_message', 3, 30),
    ('loan_book', 20, 20),
    ('open_app', 5, 1)
  ) AS allowed(source, amount, cap)
  WHERE source = _source;

  IF fixed_amount IS NULL THEN
    RAISE EXCEPTION 'source_not_client_awardable' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::int
    INTO awards_today
  FROM public.xp_events xe
  WHERE xe.user_id = uid
    AND xe.source = _source
    AND (xe.created_at AT TIME ZONE 'America/Sao_Paulo')::date =
        (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  IF awards_today >= daily_cap THEN
    RETURN QUERY
      SELECT p.xp, p.level, false, 0
      FROM public.profiles p
      WHERE p.id = uid;
    RETURN;
  END IF;

  -- A evidência é sempre lida das tabelas autoritativas. A reward_key impede
  -- premiar duas vezes o mesmo recurso, mesmo após logout/reinstalação.
  CASE _source
    WHEN 'add_book' THEN
      SELECT ub.book_id::text
        INTO reward_key
      FROM public.user_books ub
      WHERE ub.user_id = uid
        AND NOT EXISTS (
          SELECT 1 FROM public.xp_events xe
          WHERE xe.user_id = uid AND xe.source = _source
            AND xe.meta->>'reward_key' = ub.book_id::text
        )
      ORDER BY ub.created_at DESC
      LIMIT 1;

    WHEN 'finish_book' THEN
      SELECT ub.book_id::text
        INTO reward_key
      FROM public.user_books ub
      WHERE ub.user_id = uid
        AND ub.status = 'read'
        AND NOT EXISTS (
          SELECT 1 FROM public.xp_events xe
          WHERE xe.user_id = uid AND xe.source = _source
            AND xe.meta->>'reward_key' = ub.book_id::text
        )
      ORDER BY COALESCE(ub.finished_at, ub.updated_at) DESC
      LIMIT 1;

    WHEN 'rate_book' THEN
      SELECT ub.book_id::text
        INTO reward_key
      FROM public.user_books ub
      WHERE ub.user_id = uid
        AND ub.rating IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.xp_events xe
          WHERE xe.user_id = uid AND xe.source = _source
            AND xe.meta->>'reward_key' = ub.book_id::text
        )
      ORDER BY ub.updated_at DESC
      LIMIT 1;

    WHEN 'scan_book' THEN
      SELECT ui.book_id::text
        INTO reward_key
      FROM public.user_interactions ui
      WHERE ui.user_id = uid
        AND ui.kind = 'scan'
        AND NOT EXISTS (
          SELECT 1 FROM public.xp_events xe
          WHERE xe.user_id = uid AND xe.source = _source
            AND xe.meta->>'reward_key' = ui.book_id::text
        )
      ORDER BY ui.created_at DESC
      LIMIT 1;

    WHEN 'write_review' THEN
      SELECT r.id::text
        INTO reward_key
      FROM public.reviews r
      WHERE r.user_id = uid
        AND NOT EXISTS (
          SELECT 1 FROM public.xp_events xe
          WHERE xe.user_id = uid AND xe.source = _source
            AND xe.meta->>'reward_key' = r.id::text
        )
      ORDER BY r.created_at DESC
      LIMIT 1;

    WHEN 'like_review' THEN
      SELECT rl.review_id::text
        INTO reward_key
      FROM public.review_likes rl
      WHERE rl.user_id = uid
        AND NOT EXISTS (
          SELECT 1 FROM public.xp_events xe
          WHERE xe.user_id = uid AND xe.source = _source
            AND xe.meta->>'reward_key' = rl.review_id::text
        )
      ORDER BY rl.created_at DESC
      LIMIT 1;

    WHEN 'comment_review' THEN
      SELECT rc.id::text
        INTO reward_key
      FROM public.review_comments rc
      WHERE rc.user_id = uid
        AND NOT EXISTS (
          SELECT 1 FROM public.xp_events xe
          WHERE xe.user_id = uid AND xe.source = _source
            AND xe.meta->>'reward_key' = rc.id::text
        )
      ORDER BY rc.created_at DESC
      LIMIT 1;

    WHEN 'follow' THEN
      SELECT f.following_id::text
        INTO reward_key
      FROM public.follows f
      WHERE f.follower_id = uid
        AND NOT EXISTS (
          SELECT 1 FROM public.xp_events xe
          WHERE xe.user_id = uid AND xe.source = _source
            AND xe.meta->>'reward_key' = f.following_id::text
        )
      ORDER BY f.created_at DESC
      LIMIT 1;

    WHEN 'club_message' THEN
      SELECT cm.id::text
        INTO reward_key
      FROM public.club_messages cm
      WHERE cm.user_id = uid
        AND NOT EXISTS (
          SELECT 1 FROM public.xp_events xe
          WHERE xe.user_id = uid AND xe.source = _source
            AND xe.meta->>'reward_key' = cm.id::text
        )
      ORDER BY cm.created_at DESC
      LIMIT 1;

    WHEN 'loan_book' THEN
      SELECT l.id::text
        INTO reward_key
      FROM public.loans l
      WHERE l.user_id = uid
        AND NOT EXISTS (
          SELECT 1 FROM public.xp_events xe
          WHERE xe.user_id = uid AND xe.source = _source
            AND xe.meta->>'reward_key' = l.id::text
        )
      ORDER BY l.created_at DESC
      LIMIT 1;

    WHEN 'open_app' THEN
      reward_key := (now() AT TIME ZONE 'America/Sao_Paulo')::date::text;
      IF EXISTS (
        SELECT 1 FROM public.xp_events xe
        WHERE xe.user_id = uid AND xe.source = _source
          AND xe.meta->>'reward_key' = reward_key
      ) THEN
        reward_key := NULL;
      END IF;
  END CASE;

  IF reward_key IS NULL THEN
    RETURN QUERY
      SELECT p.xp, p.level, false, 0
      FROM public.profiles p
      WHERE p.id = uid;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT ax.new_xp, ax.new_level, ax.leveled_up, fixed_amount
    FROM public.add_xp(
      uid,
      fixed_amount,
      _source,
      jsonb_build_object(
        'reward_key', reward_key,
        'verified', true,
        'awarded_by', 'award_my_xp'
      )
    ) ax;
END;
$$;

REVOKE ALL ON FUNCTION public.award_my_xp(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_my_xp(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.award_my_xp(text) TO authenticated;

-- Thin self-only wrappers used by the frontend. The underlying historical RPCs
-- remain available where necessary for trusted server workers and already enforce
-- self/service boundaries in the preceding P0 migrations.
CREATE OR REPLACE FUNCTION public.recompute_my_challenge_progress()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  RETURN public.recompute_challenge_progress(uid);
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_my_challenge_progress() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_my_challenge_progress() FROM anon;
GRANT EXECUTE ON FUNCTION public.recompute_my_challenge_progress() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_streak()
RETURNS TABLE(current_days int, milestone_hit int, bonus_xp int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.update_streak(uid);
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_streak() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_my_streak() FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_streak() TO authenticated;
