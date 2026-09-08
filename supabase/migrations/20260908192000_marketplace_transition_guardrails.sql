-- Readify marketplace compatibility guardrails
-- Keeps the current TradesPage working while ensuring that every direct UPDATE
-- is validated server-side. The RPCs from the previous migration remain the
-- preferred API and use the same state-machine rules.

-- ============================================================
-- 1) PURCHASE OFFERS: guard direct UPDATEs and emit response server-side
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_purchase_offer_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.offerer_id IS DISTINCT FROM OLD.offerer_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.book_id IS DISTINCT FROM OLD.book_id
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'immutable_offer_fields';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'offer_already_final';
  END IF;

  IF NEW.status IN ('accepted', 'declined') THEN
    IF v_uid <> OLD.receiver_id THEN
      RAISE EXCEPTION 'receiver_only';
    END IF;
    IF NEW.status = 'accepted' AND NOT EXISTS (
      SELECT 1
      FROM public.user_books ub
      WHERE ub.user_id = OLD.receiver_id
        AND ub.book_id = OLD.book_id
        AND ub.available_for_trade IS TRUE
    ) THEN
      RAISE EXCEPTION 'book_no_longer_available';
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    IF v_uid <> OLD.offerer_id THEN
      RAISE EXCEPTION 'offerer_only';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_offer_transition';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_offers_transition_guard_trg ON public.purchase_offers;
CREATE TRIGGER purchase_offers_transition_guard_trg
BEFORE UPDATE ON public.purchase_offers
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_offer_update();

CREATE POLICY "po_update_state_machine"
ON public.purchase_offers
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = offerer_id OR (SELECT auth.uid()) = receiver_id)
WITH CHECK ((SELECT auth.uid()) = offerer_id OR (SELECT auth.uid()) = receiver_id);

CREATE OR REPLACE FUNCTION public.notify_purchase_offer_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book_title text;
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') THEN
    SELECT title INTO v_book_title FROM public.books WHERE id = NEW.book_id;

    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    VALUES (
      NEW.offerer_id,
      'purchase_offer_response',
      CASE NEW.status
        WHEN 'accepted' THEN 'Sua oferta foi aceita 🎉'
        ELSE 'Sua oferta foi recusada'
      END,
      CASE WHEN v_book_title IS NULL THEN NULL ELSE 'Livro: ' || v_book_title END,
      '/trocas?tab=offers',
      jsonb_build_object(
        'offer_id', NEW.id,
        'status', NEW.status,
        'book_id', NEW.book_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_offers_response_notification_trg ON public.purchase_offers;
CREATE TRIGGER purchase_offers_response_notification_trg
AFTER UPDATE OF status ON public.purchase_offers
FOR EACH ROW EXECUTE FUNCTION public.notify_purchase_offer_response();

-- Override the transition RPC so notification delivery has one canonical source:
-- the AFTER UPDATE trigger above. This prevents duplicate notifications whether
-- the caller is the new RPC client or the legacy guarded UPDATE path.
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

  RETURN v_offer;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_purchase_offer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_purchase_offer(uuid, text) TO authenticated;

-- ============================================================
-- 2) TRADES: guard legacy direct UPDATE path
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_trade_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.proposer_id IS DISTINCT FROM OLD.proposer_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.proposer_book_id IS DISTINCT FROM OLD.proposer_book_id
     OR NEW.receiver_book_id IS DISTINCT FROM OLD.receiver_book_id
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'immutable_trade_fields';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending'::public.trade_status THEN
    IF NEW.status IN ('accepted'::public.trade_status, 'declined'::public.trade_status) THEN
      IF v_uid <> OLD.receiver_id THEN
        RAISE EXCEPTION 'receiver_only';
      END IF;
      IF NEW.status = 'accepted'::public.trade_status THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.user_books ub
          WHERE ub.user_id = OLD.proposer_id
            AND ub.book_id = OLD.proposer_book_id
            AND ub.available_for_trade IS TRUE
        ) OR NOT EXISTS (
          SELECT 1 FROM public.user_books ub
          WHERE ub.user_id = OLD.receiver_id
            AND ub.book_id = OLD.receiver_book_id
            AND ub.available_for_trade IS TRUE
        ) THEN
          RAISE EXCEPTION 'trade_books_no_longer_available';
        END IF;
      END IF;
    ELSIF NEW.status = 'cancelled'::public.trade_status THEN
      IF v_uid <> OLD.proposer_id THEN
        RAISE EXCEPTION 'proposer_only';
      END IF;
    ELSE
      RAISE EXCEPTION 'invalid_trade_transition';
    END IF;
  ELSIF OLD.status = 'accepted'::public.trade_status THEN
    IF v_uid NOT IN (OLD.proposer_id, OLD.receiver_id) THEN
      RAISE EXCEPTION 'participant_only';
    END IF;
    IF NEW.status NOT IN ('completed'::public.trade_status, 'cancelled'::public.trade_status) THEN
      RAISE EXCEPTION 'invalid_trade_transition';
    END IF;
  ELSE
    RAISE EXCEPTION 'trade_already_final';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trades_transition_guard_trg ON public.trades;
CREATE TRIGGER trades_transition_guard_trg
BEFORE UPDATE ON public.trades
FOR EACH ROW EXECUTE FUNCTION public.guard_trade_update();

CREATE POLICY "trades_update_state_machine"
ON public.trades
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = proposer_id OR (SELECT auth.uid()) = receiver_id)
WITH CHECK ((SELECT auth.uid()) = proposer_id OR (SELECT auth.uid()) = receiver_id);
