-- Readify P0 security hardening — 2026-09-08
--
-- This migration intentionally DOES NOT rewrite historical migrations.
-- It closes permissive policies left by earlier iterations and moves sensitive
-- marketplace transitions behind server-side RPC state machines.

-- ============================================================
-- 1) GLOBAL CATALOG: only admins may mutate public.books
-- ============================================================
DROP POLICY IF EXISTS "books_update_auth" ON public.books;
DROP POLICY IF EXISTS "books_update_authenticated" ON public.books;
DROP POLICY IF EXISTS "books_update_admin" ON public.books;

CREATE POLICY "books_update_admin"
ON public.books
FOR UPDATE
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  AND length(btrim(title)) > 0
);

-- ============================================================
-- 2) SYSTEM EVENTS: client roles cannot forge server-looking events
-- ============================================================
DROP POLICY IF EXISTS "notifications_insert_system_kinds" ON public.notifications;
DROP POLICY IF EXISTS "activities_insert_system_kinds" ON public.activities;

-- Existing owner/self policies remain in place. SECURITY DEFINER triggers do not
-- need a generic authenticated INSERT policy in order to emit server events.

-- ============================================================
-- 3) PURCHASE OFFERS: immutable data + server-side state machine
-- ============================================================
DROP POLICY IF EXISTS "po_insert_offerer" ON public.purchase_offers;
DROP POLICY IF EXISTS "po_update_involved" ON public.purchase_offers;
DROP POLICY IF EXISTS "po_delete_offerer" ON public.purchase_offers;

CREATE OR REPLACE FUNCTION public.create_purchase_offer(
  _receiver_id uuid,
  _book_id uuid,
  _amount_cents integer,
  _message text DEFAULT NULL
)
RETURNS public.purchase_offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.purchase_offers%ROWTYPE;
  v_sender_name text;
  v_book_title text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _receiver_id IS NULL OR _book_id IS NULL OR _receiver_id = v_uid THEN
    RAISE EXCEPTION 'invalid_offer_target';
  END IF;
  IF _amount_cents IS NULL OR _amount_cents < 100 OR _amount_cents > 10000000 THEN
    RAISE EXCEPTION 'invalid_offer_amount';
  END IF;
  IF _message IS NOT NULL AND length(_message) > 400 THEN
    RAISE EXCEPTION 'message_too_long';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_books ub
    WHERE ub.user_id = _receiver_id
      AND ub.book_id = _book_id
      AND ub.available_for_trade IS TRUE
      AND ub.is_public IS TRUE
  ) THEN
    RAISE EXCEPTION 'book_not_available';
  END IF;

  INSERT INTO public.purchase_offers (
    offerer_id, receiver_id, book_id, amount_cents, currency, message, status
  ) VALUES (
    v_uid,
    _receiver_id,
    _book_id,
    _amount_cents,
    'BRL',
    NULLIF(btrim(_message), ''),
    'pending'
  )
  RETURNING * INTO v_offer;

  SELECT COALESCE(display_name, username, 'Alguém')
    INTO v_sender_name
  FROM public.profiles
  WHERE id = v_uid;

  SELECT title INTO v_book_title
  FROM public.books
  WHERE id = _book_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  VALUES (
    _receiver_id,
    'purchase_offer',
    COALESCE(v_sender_name, 'Alguém') || ' quer comprar ' || COALESCE(v_book_title, 'seu livro'),
    'Você recebeu uma oferta de ' || to_char(_amount_cents / 100.0, 'FM999G999G990D00') || ' BRL.',
    '/trocas?tab=offers',
    jsonb_build_object(
      'offer_id', v_offer.id,
      'from_user_id', v_uid,
      'book_id', _book_id,
      'amount_cents', _amount_cents,
      'currency', 'BRL'
    )
  );

  RETURN v_offer;
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_offer(uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase_offer(uuid, uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_purchase_offer(
  _offer_id uuid,
  _action text
)
RETURNS public.purchase_offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.purchase_offers%ROWTYPE;
  v_next text;
  v_book_title text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_offer
  FROM public.purchase_offers
  WHERE id = _offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'offer_not_found';
  END IF;
  IF v_offer.status <> 'pending' THEN
    RAISE EXCEPTION 'offer_not_pending';
  END IF;

  v_next := lower(btrim(COALESCE(_action, '')));

  IF v_next IN ('accepted', 'declined') THEN
    IF v_uid <> v_offer.receiver_id THEN
      RAISE EXCEPTION 'receiver_only';
    END IF;
    IF v_next = 'accepted' AND NOT EXISTS (
      SELECT 1 FROM public.user_books ub
      WHERE ub.user_id = v_offer.receiver_id
        AND ub.book_id = v_offer.book_id
        AND ub.available_for_trade IS TRUE
    ) THEN
      RAISE EXCEPTION 'book_no_longer_available';
    END IF;
  ELSIF v_next = 'cancelled' THEN
    IF v_uid <> v_offer.offerer_id THEN
      RAISE EXCEPTION 'offerer_only';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_offer_transition';
  END IF;

  UPDATE public.purchase_offers
  SET status = v_next
  WHERE id = v_offer.id
  RETURNING * INTO v_offer;

  IF v_next IN ('accepted', 'declined') THEN
    SELECT title INTO v_book_title FROM public.books WHERE id = v_offer.book_id;
    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    VALUES (
      v_offer.offerer_id,
      'purchase_offer_response',
      CASE v_next
        WHEN 'accepted' THEN 'Sua oferta foi aceita 🎉'
        ELSE 'Sua oferta foi recusada'
      END,
      CASE WHEN v_book_title IS NULL THEN NULL ELSE 'Livro: ' || v_book_title END,
      '/trocas?tab=offers',
      jsonb_build_object('offer_id', v_offer.id, 'status', v_next, 'book_id', v_offer.book_id)
    );
  END IF;

  RETURN v_offer;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_purchase_offer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_purchase_offer(uuid, text) TO authenticated;

-- ============================================================
-- 4) TRADES: creation and transitions validated server-side
-- ============================================================
DROP POLICY IF EXISTS "trades_insert_self" ON public.trades;
DROP POLICY IF EXISTS "trades_update_participants" ON public.trades;

CREATE OR REPLACE FUNCTION public.create_trade_proposal(
  _receiver_id uuid,
  _proposer_book_id uuid,
  _receiver_book_id uuid,
  _message text DEFAULT NULL
)
RETURNS public.trades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trade public.trades%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _receiver_id IS NULL OR _receiver_id = v_uid THEN
    RAISE EXCEPTION 'invalid_receiver';
  END IF;
  IF _proposer_book_id IS NULL OR _receiver_book_id IS NULL THEN
    RAISE EXCEPTION 'book_required';
  END IF;
  IF _message IS NOT NULL AND length(_message) > 500 THEN
    RAISE EXCEPTION 'message_too_long';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_books ub
    WHERE ub.user_id = v_uid
      AND ub.book_id = _proposer_book_id
      AND ub.available_for_trade IS TRUE
  ) THEN
    RAISE EXCEPTION 'proposer_book_not_available';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_books ub
    WHERE ub.user_id = _receiver_id
      AND ub.book_id = _receiver_book_id
      AND ub.available_for_trade IS TRUE
      AND ub.is_public IS TRUE
  ) THEN
    RAISE EXCEPTION 'receiver_book_not_available';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trades t
    WHERE t.proposer_id = v_uid
      AND t.receiver_id = _receiver_id
      AND t.proposer_book_id = _proposer_book_id
      AND t.receiver_book_id = _receiver_book_id
      AND t.status IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION 'trade_already_active';
  END IF;

  INSERT INTO public.trades (
    proposer_id, receiver_id, proposer_book_id, receiver_book_id, message, status
  ) VALUES (
    v_uid,
    _receiver_id,
    _proposer_book_id,
    _receiver_book_id,
    NULLIF(btrim(_message), ''),
    'pending'::public.trade_status
  )
  RETURNING * INTO v_trade;

  RETURN v_trade;
END;
$$;

REVOKE ALL ON FUNCTION public.create_trade_proposal(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_trade_proposal(uuid, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_trade(
  _trade_id uuid,
  _action text
)
RETURNS public.trades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trade public.trades%ROWTYPE;
  v_action text;
  v_next public.trade_status;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_trade
  FROM public.trades
  WHERE id = _trade_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade_not_found';
  END IF;

  v_action := lower(btrim(COALESCE(_action, '')));

  IF v_trade.status = 'pending'::public.trade_status THEN
    IF v_action IN ('accepted', 'declined') THEN
      IF v_uid <> v_trade.receiver_id THEN
        RAISE EXCEPTION 'receiver_only';
      END IF;
      IF v_action = 'accepted' THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.user_books ub
          WHERE ub.user_id = v_trade.proposer_id
            AND ub.book_id = v_trade.proposer_book_id
            AND ub.available_for_trade IS TRUE
        ) OR NOT EXISTS (
          SELECT 1 FROM public.user_books ub
          WHERE ub.user_id = v_trade.receiver_id
            AND ub.book_id = v_trade.receiver_book_id
            AND ub.available_for_trade IS TRUE
        ) THEN
          RAISE EXCEPTION 'trade_books_no_longer_available';
        END IF;
      END IF;
      v_next := v_action::public.trade_status;
    ELSIF v_action = 'cancelled' THEN
      IF v_uid <> v_trade.proposer_id THEN
        RAISE EXCEPTION 'proposer_only';
      END IF;
      v_next := 'cancelled'::public.trade_status;
    ELSE
      RAISE EXCEPTION 'invalid_trade_transition';
    END IF;
  ELSIF v_trade.status = 'accepted'::public.trade_status THEN
    IF v_uid NOT IN (v_trade.proposer_id, v_trade.receiver_id) THEN
      RAISE EXCEPTION 'participant_only';
    END IF;
    IF v_action = 'completed' THEN
      v_next := 'completed'::public.trade_status;
    ELSIF v_action = 'cancelled' THEN
      v_next := 'cancelled'::public.trade_status;
    ELSE
      RAISE EXCEPTION 'invalid_trade_transition';
    END IF;
  ELSE
    RAISE EXCEPTION 'trade_already_final';
  END IF;

  UPDATE public.trades
  SET status = v_next
  WHERE id = v_trade.id
  RETURNING * INTO v_trade;

  RETURN v_trade;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_trade(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_trade(uuid, text) TO authenticated;

-- ============================================================
-- 5) TRADE MATCHES: participants may only dismiss a pending match
-- ============================================================
DROP POLICY IF EXISTS "trade_matches_update_involved" ON public.trade_matches;

CREATE OR REPLACE FUNCTION public.dismiss_trade_match(_match_id uuid)
RETURNS public.trade_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match public.trade_matches%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match
  FROM public.trade_matches
  WHERE id = _match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;
  IF v_uid NOT IN (v_match.offerer_id, v_match.wisher_id) THEN
    RAISE EXCEPTION 'participant_only';
  END IF;
  IF v_match.status <> 'pending' THEN
    RAISE EXCEPTION 'match_not_pending';
  END IF;

  UPDATE public.trade_matches
  SET status = 'dismissed', resolved_at = now()
  WHERE id = v_match.id
  RETURNING * INTO v_match;

  RETURN v_match;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_trade_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_trade_match(uuid) TO authenticated;

-- ============================================================
-- 6) PUSH: derive all payload data from notifications table
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_service_role text;
BEGIN
  v_url := nullif(current_setting('app.supabase_url', true), '');
  v_service_role := nullif(current_setting('app.service_role_key', true), '');

  -- In-app notification remains valid even if push is not configured.
  IF v_url IS NULL OR v_service_role IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role,
      'apikey', v_service_role
    ),
    body := jsonb_build_object('notification_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Push failure must never roll back the source notification.
  RETURN NEW;
END;
$$;

-- ============================================================
-- 7) CRON: remove public-key jobs and use runtime server credential
-- ============================================================
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname LIKE 'process-enrichment-queue%'
       OR jobname LIKE 'process-normalization-queue%'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'process-enrichment-queue-secure-2min',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/process-enrichment-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
      'apikey', current_setting('app.service_role_key', true),
      'x-cron-source', 'readify-internal'
    ),
    body := jsonb_build_object('time', now())
  )
  WHERE nullif(current_setting('app.supabase_url', true), '') IS NOT NULL
    AND nullif(current_setting('app.service_role_key', true), '') IS NOT NULL;
  $cron$
);

SELECT cron.schedule(
  'process-normalization-queue-secure-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/process-normalization-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
      'apikey', current_setting('app.service_role_key', true),
      'x-cron-source', 'readify-internal'
    ),
    body := jsonb_build_object('time', now())
  )
  WHERE nullif(current_setting('app.supabase_url', true), '') IS NOT NULL
    AND nullif(current_setting('app.service_role_key', true), '') IS NOT NULL;
  $cron$
);
