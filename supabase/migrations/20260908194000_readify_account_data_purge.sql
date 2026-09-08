-- ============================================================
-- READIFY — TRANSACTIONAL USER DATA PURGE
-- 2026-09-08
--
-- Used only by the authenticated account-deletion Edge Function through the
-- service role. PostgreSQL function execution is one transaction: a failure
-- rolls the public-data purge back instead of leaving a half-deleted account.
--
-- Shared-resource rule:
-- - user-authored content is deleted;
-- - buddy-read sessions involving the departing user are removed;
-- - owned clubs are transferred to the oldest remaining member;
-- - an owned club is deleted only when no other member remains.
-- ============================================================

CREATE OR REPLACE FUNCTION public.purge_user_data(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club record;
  v_successor uuid;
  v_transferred_clubs integer := 0;
  v_deleted_clubs integer := 0;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  -- -------------------------------------------------------------------------
  -- 1) Shared clubs: preserve other users' data by transferring ownership.
  -- -------------------------------------------------------------------------
  FOR v_club IN
    SELECT id
    FROM public.book_clubs
    WHERE owner_id = _user_id
    FOR UPDATE
  LOOP
    SELECT cm.user_id
      INTO v_successor
    FROM public.club_members cm
    WHERE cm.club_id = v_club.id
      AND cm.user_id <> _user_id
    ORDER BY cm.joined_at ASC, cm.user_id ASC
    LIMIT 1;

    IF v_successor IS NULL THEN
      DELETE FROM public.book_clubs WHERE id = v_club.id;
      v_deleted_clubs := v_deleted_clubs + 1;
    ELSE
      UPDATE public.book_clubs
      SET owner_id = v_successor,
          updated_at = now()
      WHERE id = v_club.id;
      v_transferred_clubs := v_transferred_clubs + 1;
    END IF;
  END LOOP;

  -- Administrative invite credentials created by the departing user must not
  -- survive even when a club itself was transferred.
  IF to_regclass('public.club_invite_links') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.club_invite_links WHERE created_by = $1'
      USING _user_id;
  END IF;

  -- -------------------------------------------------------------------------
  -- 2) Child/authored rows first.
  -- -------------------------------------------------------------------------
  DELETE FROM public.story_views WHERE user_id = _user_id;
  DELETE FROM public.club_invite_redemptions WHERE user_id = _user_id;
  DELETE FROM public.club_message_reactions WHERE user_id = _user_id;
  DELETE FROM public.club_book_votes WHERE user_id = _user_id;
  DELETE FROM public.club_book_nominations WHERE nominated_by = _user_id;
  DELETE FROM public.club_messages WHERE user_id = _user_id;
  DELETE FROM public.club_members WHERE user_id = _user_id;

  DELETE FROM public.club_join_requests WHERE user_id = _user_id;
  DELETE FROM public.club_invitations
   WHERE invitee_id = _user_id OR invited_by = _user_id;

  DELETE FROM public.buddy_read_messages WHERE user_id = _user_id;
  DELETE FROM public.buddy_read_participants WHERE user_id = _user_id;
  DELETE FROM public.buddy_reads
   WHERE initiator_id = _user_id OR invitee_id = _user_id;

  DELETE FROM public.activity_comments WHERE user_id = _user_id;
  DELETE FROM public.activity_likes WHERE user_id = _user_id;
  DELETE FROM public.review_comments WHERE user_id = _user_id;
  DELETE FROM public.review_likes WHERE user_id = _user_id;
  DELETE FROM public.recommendation_comments WHERE user_id = _user_id;
  DELETE FROM public.recommendation_likes WHERE user_id = _user_id;

  -- -------------------------------------------------------------------------
  -- 3) Social/commercial relationships involving the user.
  -- -------------------------------------------------------------------------
  DELETE FROM public.invite_redemptions
   WHERE inviter_id = _user_id OR invitee_id = _user_id;
  DELETE FROM public.purchase_offers
   WHERE offerer_id = _user_id OR receiver_id = _user_id;
  DELETE FROM public.trade_matches
   WHERE offerer_id = _user_id OR wisher_id = _user_id;
  DELETE FROM public.trades
   WHERE proposer_id = _user_id OR receiver_id = _user_id;
  DELETE FROM public.follows
   WHERE follower_id = _user_id OR following_id = _user_id;
  DELETE FROM public.activities
   WHERE user_id = _user_id OR target_user_id = _user_id;
  DELETE FROM public.notifications WHERE user_id = _user_id;
  DELETE FROM public.push_subscriptions WHERE user_id = _user_id;

  -- -------------------------------------------------------------------------
  -- 4) User-owned content and personal state.
  -- -------------------------------------------------------------------------
  DELETE FROM public.stories WHERE user_id = _user_id;
  DELETE FROM public.daily_surprise_claims WHERE user_id = _user_id;
  DELETE FROM public.user_challenges WHERE user_id = _user_id;
  DELETE FROM public.user_streaks WHERE user_id = _user_id;
  DELETE FROM public.xp_events WHERE user_id = _user_id;
  DELETE FROM public.user_interactions WHERE user_id = _user_id;
  DELETE FROM public.user_achievements WHERE user_id = _user_id;
  DELETE FROM public.reading_goals WHERE user_id = _user_id;
  DELETE FROM public.user_book_notes WHERE user_id = _user_id;
  DELETE FROM public.loans WHERE user_id = _user_id;
  DELETE FROM public.book_recommendations WHERE user_id = _user_id;
  DELETE FROM public.reviews WHERE user_id = _user_id;
  DELETE FROM public.user_books WHERE user_id = _user_id;
  DELETE FROM public.app_events WHERE user_id = _user_id;
  DELETE FROM public.invites WHERE user_id = _user_id;

  -- Security/operational rows are removed because Readify currently promises
  -- complete deletion. If a future legal-retention policy keeps them, that must
  -- be explicitly disclosed and identifiers must be anonymized instead.
  DELETE FROM public.automation_runs WHERE triggered_by = _user_id;
  DELETE FROM public.admin_audit_log WHERE actor_id = _user_id;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'transferred_clubs', v_transferred_clubs,
    'deleted_empty_clubs', v_deleted_clubs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_data(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_data(uuid)
  TO service_role;
