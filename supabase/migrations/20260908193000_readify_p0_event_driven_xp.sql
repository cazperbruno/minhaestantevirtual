-- ============================================================
-- READIFY P0 — EVENT-DRIVEN, SERVER-AUTHORITATIVE XP
-- 2026-09-08
--
-- The browser no longer asks the database to award arbitrary XP. Rewards are
-- derived from persisted rows and state transitions, deduplicated server-side.
-- ============================================================

ALTER TABLE public.xp_events
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS xp_events_dedupe_idx
  ON public.xp_events(user_id, source, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Internal-only primitive used by trusted triggers/functions.
CREATE OR REPLACE FUNCTION public.grant_xp_event(
  _user_id uuid,
  _amount integer,
  _source text,
  _dedupe_key text,
  _meta jsonb DEFAULT NULL,
  _daily_cap integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_old_level integer;
  v_new_xp integer;
  v_new_level integer;
  v_today_count integer;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0
     OR _source IS NULL OR btrim(_source) = ''
     OR _dedupe_key IS NULL OR btrim(_dedupe_key) = '' THEN
    RETURN false;
  END IF;

  -- Serialize rewards for the same user/source so daily caps remain deterministic.
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _source, 0));

  IF _daily_cap IS NOT NULL AND _daily_cap > 0 THEN
    SELECT count(*)::integer
      INTO v_today_count
    FROM public.xp_events xe
    WHERE xe.user_id = _user_id
      AND xe.source = _source
      AND xe.created_at >= date_trunc('day', now());

    IF v_today_count >= _daily_cap THEN
      RETURN false;
    END IF;
  END IF;

  INSERT INTO public.xp_events (user_id, amount, source, meta, dedupe_key)
  VALUES (_user_id, _amount, _source, _meta, _dedupe_key)
  ON CONFLICT (user_id, source, dedupe_key) WHERE dedupe_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT level INTO v_old_level
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  UPDATE public.profiles
  SET xp = GREATEST(0, xp + _amount),
      updated_at = now()
  WHERE id = _user_id
  RETURNING xp INTO v_new_xp;

  v_new_level := public.level_for_xp(v_new_xp);

  UPDATE public.profiles
  SET level = v_new_level
  WHERE id = _user_id
    AND level IS DISTINCT FROM v_new_level;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_xp_event(uuid, integer, text, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_xp_event(uuid, integer, text, text, jsonb, integer)
  TO service_role;

-- Legacy amount-bearing API is never exposed to browser roles.
REVOKE ALL ON FUNCTION public.add_xp(uuid, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_xp(uuid, integer, text, jsonb)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Library actions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_xp_from_user_book()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.grant_xp_event(
      NEW.user_id, 10, 'add_book',
      'book:' || NEW.book_id::text || ':add',
      jsonb_build_object('book_id', NEW.book_id),
      20
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'read' AND OLD.status IS DISTINCT FROM 'read' THEN
    PERFORM public.grant_xp_event(
      NEW.user_id, 50, 'finish_book',
      'book:' || NEW.book_id::text || ':finish',
      jsonb_build_object('book_id', NEW.book_id),
      5
    );
  END IF;

  IF NEW.rating IS NOT NULL AND NEW.rating IS DISTINCT FROM OLD.rating THEN
    PERFORM public.grant_xp_event(
      NEW.user_id, 15, 'rate_book',
      'book:' || NEW.book_id::text || ':rate',
      jsonb_build_object('book_id', NEW.book_id),
      20
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xp_user_books ON public.user_books;
CREATE TRIGGER trg_xp_user_books
AFTER INSERT OR UPDATE OF status, rating ON public.user_books
FOR EACH ROW EXECUTE FUNCTION public.award_xp_from_user_book();

-- ---------------------------------------------------------------------------
-- Scanner: one lifetime scan reward per book/user; action remains measurable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_xp_from_scan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind = 'scan' THEN
    PERFORM public.grant_xp_event(
      NEW.user_id, 8, 'scan_book',
      'book:' || NEW.book_id::text || ':scan',
      jsonb_build_object('book_id', NEW.book_id, 'interaction_id', NEW.id),
      50
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xp_user_interactions ON public.user_interactions;
CREATE TRIGGER trg_xp_user_interactions
AFTER INSERT ON public.user_interactions
FOR EACH ROW EXECUTE FUNCTION public.award_xp_from_scan();

-- ---------------------------------------------------------------------------
-- Reviews and lightweight social actions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_xp_from_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.grant_xp_event(
    NEW.user_id, 30, 'write_review',
    'book:' || NEW.book_id::text || ':review',
    jsonb_build_object('book_id', NEW.book_id, 'review_id', NEW.id),
    10
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xp_reviews ON public.reviews;
CREATE TRIGGER trg_xp_reviews
AFTER INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.award_xp_from_review();

CREATE OR REPLACE FUNCTION public.award_xp_from_review_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.grant_xp_event(
    NEW.user_id, 2, 'like_review',
    'review:' || NEW.review_id::text || ':like',
    jsonb_build_object('review_id', NEW.review_id),
    100
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xp_review_likes ON public.review_likes;
CREATE TRIGGER trg_xp_review_likes
AFTER INSERT ON public.review_likes
FOR EACH ROW EXECUTE FUNCTION public.award_xp_from_review_like();

CREATE OR REPLACE FUNCTION public.award_xp_from_review_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.grant_xp_event(
    NEW.user_id, 5, 'comment_review',
    'comment:' || NEW.id::text,
    jsonb_build_object('review_id', NEW.review_id, 'comment_id', NEW.id),
    50
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xp_review_comments ON public.review_comments;
CREATE TRIGGER trg_xp_review_comments
AFTER INSERT ON public.review_comments
FOR EACH ROW EXECUTE FUNCTION public.award_xp_from_review_comment();

CREATE OR REPLACE FUNCTION public.award_xp_from_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.grant_xp_event(
    NEW.follower_id, 5, 'follow',
    'user:' || NEW.following_id::text || ':follow',
    jsonb_build_object('following_id', NEW.following_id),
    30
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xp_follows ON public.follows;
CREATE TRIGGER trg_xp_follows
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.award_xp_from_follow();

CREATE OR REPLACE FUNCTION public.award_xp_from_club_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.grant_xp_event(
    NEW.user_id, 3, 'club_message',
    'message:' || NEW.id::text,
    jsonb_build_object('club_id', NEW.club_id, 'message_id', NEW.id),
    100
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xp_club_messages ON public.club_messages;
CREATE TRIGGER trg_xp_club_messages
AFTER INSERT ON public.club_messages
FOR EACH ROW EXECUTE FUNCTION public.award_xp_from_club_message();

CREATE OR REPLACE FUNCTION public.award_xp_from_loan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.grant_xp_event(
    NEW.user_id, 20, 'loan_book',
    'loan:' || NEW.id::text,
    jsonb_build_object('book_id', NEW.book_id, 'loan_id', NEW.id),
    20
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xp_loans ON public.loans;
CREATE TRIGGER trg_xp_loans
AFTER INSERT ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.award_xp_from_loan();

-- ---------------------------------------------------------------------------
-- Self-only wrappers required by the client. They never accept a target user.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_my_streak()
RETURNS TABLE(current_days int, milestone_hit int, bonus_xp int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current int;
  v_hit int;
  v_bonus int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT s.current_days, s.milestone_hit, s.bonus_xp
    INTO v_current, v_hit, v_bonus
  FROM public.update_streak(v_uid) AS s;

  PERFORM public.grant_xp_event(
    v_uid, 5, 'open_app',
    'day:' || CURRENT_DATE::text,
    jsonb_build_object('date', CURRENT_DATE),
    1
  );

  RETURN QUERY SELECT v_current, v_hit, v_bonus;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_streak() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_streak() TO authenticated;

CREATE OR REPLACE FUNCTION public.recompute_my_challenge_progress()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  RETURN public.recompute_challenge_progress(v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_my_challenge_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_my_challenge_progress() TO authenticated;
