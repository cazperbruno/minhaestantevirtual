-- ============================================================
-- READIFY REACTIVATION — P0 RPC TRUST BOUNDARIES
-- 2026-09-08
--
-- Remove do cliente a capacidade de escolher user_id em rotinas de
-- gamificação/convite. Mantém as rotinas legadas como implementação interna
-- e expõe somente wrappers self-only.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Bloquear RPCs legadas que aceitam user_id arbitrário.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.add_xp(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_streak(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_daily_challenges(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_challenge_progress(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_challenge(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_invite(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_invite(text, uuid) FROM PUBLIC, anon, authenticated;

-- Service-side callers continuam podendo usar as implementações legadas.
GRANT EXECUTE ON FUNCTION public.add_xp(uuid, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_streak(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_daily_challenges(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_challenge_progress(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_challenge(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_invite(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text, uuid) TO service_role;

-- ------------------------------------------------------------
-- 2. XP self-only com valor definido no servidor.
-- `_amount` deixa de existir no contrato público.
-- Caps diários reduzem abuso enquanto a próxima onda migra concessões para
-- eventos/triggers totalmente verificáveis pelo servidor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_my_xp(
  _source text,
  _meta jsonb DEFAULT NULL
)
RETURNS TABLE(new_xp int, new_level int, leveled_up boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  fixed_amount int;
  max_awards_per_day int;
  awards_today int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT amount, daily_cap
  INTO fixed_amount, max_awards_per_day
  FROM (VALUES
    ('add_book', 10, 20),
    ('finish_book', 50, 5),
    ('rate_book', 15, 20),
    ('scan_book', 8, 50),
    ('write_review', 30, 10),
    ('like_review', 2, 100),
    ('comment_review', 5, 50),
    ('follow', 5, 30),
    ('club_message', 3, 100),
    ('loan_book', 20, 20),
    ('open_app', 5, 1)
  ) AS allowed(source, amount, daily_cap)
  WHERE source = _source;

  IF fixed_amount IS NULL THEN
    RAISE EXCEPTION 'source_not_client_awardable';
  END IF;

  SELECT count(*)::int
  INTO awards_today
  FROM public.xp_events xe
  WHERE xe.user_id = uid
    AND xe.source = _source
    AND xe.created_at >= date_trunc('day', now());

  IF awards_today >= max_awards_per_day THEN
    RETURN QUERY
      SELECT p.xp, p.level, false
      FROM public.profiles p
      WHERE p.id = uid;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT *
    FROM public.add_xp(uid, fixed_amount, _source, _meta);
END;
$$;

REVOKE ALL ON FUNCTION public.award_my_xp(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_my_xp(text, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- 3. Streak/challenges: wrappers sem user_id.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_my_streak()
RETURNS TABLE(current_days int, milestone_hit int, bonus_xp int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM public.update_streak((SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.update_my_streak() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_streak() TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_my_challenges()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN public.assign_daily_challenges(uid);
END;
$$;
REVOKE ALL ON FUNCTION public.assign_my_challenges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_my_challenges() TO authenticated;

CREATE OR REPLACE FUNCTION public.recompute_my_challenge_progress()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN public.recompute_challenge_progress(uid);
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_my_challenge_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_my_challenge_progress() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_my_challenge(_challenge_id uuid)
RETURNS TABLE(success boolean, xp_granted int, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
    SELECT * FROM public.claim_challenge(uid, _challenge_id);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_my_challenge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_my_challenge(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 4. Convites: wrappers self-only.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_my_invite()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN public.ensure_invite(uid);
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_my_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_invite() TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_my_invite(_code text)
RETURNS TABLE(success boolean, inviter_id uuid, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _code IS NULL OR length(trim(_code)) < 4 OR length(trim(_code)) > 32 THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;
  RETURN QUERY
    SELECT * FROM public.redeem_invite(upper(trim(_code)), uid);
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_my_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_my_invite(text) TO authenticated;
