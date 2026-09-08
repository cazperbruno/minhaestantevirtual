-- READIFY P0 SECURITY HARDENING — 2026-09-08
-- Goal: close client-side privilege escalation paths without deleting user data.

-- -----------------------------------------------------------------------------
-- 1) Global catalog: only admins may mutate canonical book metadata.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS books_update_auth ON public.books;
DROP POLICY IF EXISTS books_update_authenticated ON public.books;
DROP POLICY IF EXISTS books_update_admin ON public.books;

CREATE POLICY books_update_admin
ON public.books
FOR UPDATE
TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)))
WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)));

-- -----------------------------------------------------------------------------
-- 2) System notifications / activities: SECURITY DEFINER triggers do not require
--    permissive client INSERT policies. Remove the forgeable client policies.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS notifications_insert_system_kinds ON public.notifications;
DROP POLICY IF EXISTS activities_insert_system_kinds ON public.activities;

-- -----------------------------------------------------------------------------
-- 3) XP: never let an authenticated client choose arbitrary XP amount/source.
--    SECURITY DEFINER routines owned by the database may still call add_xp.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.add_xp(uuid, integer, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_xp(uuid, integer, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_xp(uuid, integer, text, jsonb) FROM authenticated;

-- Keep self-scoped gamification RPCs callable while preventing BOLA/IDOR.
CREATE OR REPLACE FUNCTION public.update_streak(_user_id uuid)
RETURNS TABLE(current_days int, milestone_hit int, bonus_xp int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record; today date := CURRENT_DATE; new_current int := 1; bonus int := 0; hit int := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO s FROM public.user_streaks WHERE user_id = _user_id;

  IF s IS NULL THEN
    INSERT INTO public.user_streaks (user_id, current_days, longest_days, last_active_date, next_milestone)
    VALUES (_user_id, 1, 1, today, 7);
    RETURN QUERY SELECT 1, 0, 0;
    RETURN;
  END IF;

  IF s.last_active_date = today THEN
    RETURN QUERY SELECT s.current_days, 0, 0;
    RETURN;
  ELSIF s.last_active_date = today - 1 THEN
    new_current := s.current_days + 1;
  ELSE
    new_current := 1;
  END IF;

  IF new_current IN (7, 30, 100, 365) THEN
    hit := new_current;
    bonus := CASE new_current WHEN 7 THEN 50 WHEN 30 THEN 200 WHEN 100 THEN 1000 WHEN 365 THEN 5000 END;
    PERFORM public.add_xp(_user_id, bonus, 'streak_milestone', jsonb_build_object('days', new_current));
  END IF;

  UPDATE public.user_streaks
    SET current_days = new_current,
        longest_days = GREATEST(longest_days, new_current),
        last_active_date = today,
        next_milestone = CASE
          WHEN new_current < 7 THEN 7
          WHEN new_current < 30 THEN 30
          WHEN new_current < 100 THEN 100
          WHEN new_current < 365 THEN 365
          ELSE 365
        END,
        updated_at = now()
    WHERE user_id = _user_id;

  RETURN QUERY SELECT new_current, hit, bonus;
END $$;

CREATE OR REPLACE FUNCTION public.recompute_challenge_progress(_user_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ch record; new_progress int; updated_count int := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
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

CREATE OR REPLACE FUNCTION public.claim_challenge(_user_id uuid, _challenge_id uuid)
RETURNS TABLE(success boolean, xp_granted int, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch record;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO ch FROM public.user_challenges WHERE id = _challenge_id AND user_id = _user_id FOR UPDATE;
  IF ch IS NULL THEN RETURN QUERY SELECT false, 0, 'not_found'::text; RETURN; END IF;
  IF ch.status = 'claimed' THEN RETURN QUERY SELECT false, 0, 'already_claimed'::text; RETURN; END IF;
  IF ch.status <> 'completed' THEN RETURN QUERY SELECT false, 0, 'not_completed'::text; RETURN; END IF;

  UPDATE public.user_challenges SET status = 'claimed', claimed_at = now() WHERE id = _challenge_id;
  PERFORM public.add_xp(_user_id, ch.xp_reward, 'challenge', jsonb_build_object('code', ch.template_code));

  RETURN QUERY SELECT true, ch.xp_reward, 'ok'::text;
END $$;

-- Existing assignment function keeps its business logic; add a self-only gate via a
-- wrapper-friendly precondition by revoking anonymous/public execution.
REVOKE ALL ON FUNCTION public.assign_daily_challenges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_daily_challenges(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_invite(uuid) TO authenticated;

-- Cross-user redemption is especially sensitive. Preserve signature but require
-- the invitee id to be the authenticated caller.
CREATE OR REPLACE FUNCTION public.redeem_invite(_code text, _new_user_id uuid)
RETURNS TABLE(success boolean, inviter_id uuid, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _new_user_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invite_redemptions WHERE invitee_id = _new_user_id) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'already_redeemed'::text; RETURN;
  END IF;

  SELECT * INTO inv FROM public.invites WHERE code = UPPER(_code);
  IF inv IS NULL THEN RETURN QUERY SELECT false, NULL::uuid, 'invalid_code'::text; RETURN; END IF;
  IF inv.user_id = _new_user_id THEN RETURN QUERY SELECT false, NULL::uuid, 'self_invite'::text; RETURN; END IF;

  INSERT INTO public.invite_redemptions (inviter_id, invitee_id, code)
  VALUES (inv.user_id, _new_user_id, inv.code);

  PERFORM public.add_xp(inv.user_id, 200, 'invite_signup', jsonb_build_object('invitee', _new_user_id));
  PERFORM public.add_xp(_new_user_id, 100, 'invite_welcome', jsonb_build_object('inviter', inv.user_id));

  UPDATE public.invites
  SET signups_count = signups_count + 1, xp_earned = xp_earned + 200
  WHERE user_id = inv.user_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  VALUES (inv.user_id, 'invite_redeemed', 'Seu convite foi aceito! +200 XP',
          'Um novo leitor entrou no Readify pelo seu link.', '/progresso',
          jsonb_build_object('invitee_id', _new_user_id));

  RETURN QUERY SELECT true, inv.user_id, 'ok'::text;
END $$;

-- -----------------------------------------------------------------------------
-- 4) Purchase offers: immutable commercial fields + strict state machine.
--    Existing RLS remains as the row-level gate; this trigger enforces transitions.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_purchase_offer_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NEW.offerer_id IS DISTINCT FROM OLD.offerer_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.book_id IS DISTINCT FROM OLD.book_id
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'immutable purchase offer fields cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'purchase offer is already final' USING ERRCODE = '42501';
  END IF;

  IF uid = OLD.receiver_id AND NEW.status IN ('accepted', 'declined') THEN
    RETURN NEW;
  END IF;

  IF uid = OLD.offerer_id AND NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid purchase offer transition' USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS enforce_purchase_offer_transition_trg ON public.purchase_offers;
CREATE TRIGGER enforce_purchase_offer_transition_trg
BEFORE UPDATE ON public.purchase_offers
FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_offer_transition();

-- -----------------------------------------------------------------------------
-- 5) Trade matches: parties/book are immutable and final states cannot be reopened.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_trade_match_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NEW.book_id IS DISTINCT FROM OLD.book_id
     OR NEW.offerer_id IS DISTINCT FROM OLD.offerer_id
     OR NEW.wisher_id IS DISTINCT FROM OLD.wisher_id
     OR NEW.detected_at IS DISTINCT FROM OLD.detected_at THEN
    RAISE EXCEPTION 'immutable trade match fields cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF uid IS NULL OR (uid <> OLD.offerer_id AND uid <> OLD.wisher_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF OLD.status <> 'pending' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'trade match state cannot be reopened' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'pending' AND NEW.status NOT IN ('pending', 'proposed', 'dismissed', 'expired') THEN
    RAISE EXCEPTION 'invalid trade match transition' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_trade_match_transition_trg ON public.trade_matches;
CREATE TRIGGER enforce_trade_match_transition_trg
BEFORE UPDATE ON public.trade_matches
FOR EACH ROW EXECUTE FUNCTION public.enforce_trade_match_transition();

-- -----------------------------------------------------------------------------
-- 6) Stop the legacy cron that authenticates privileged work with an anon key.
--    It will be recreated later using a server-side secret/Vault integration.
-- -----------------------------------------------------------------------------
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'process-enrichment-queue-2min';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;
