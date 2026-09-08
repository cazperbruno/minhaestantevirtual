-- ============================================================
-- READIFY REACTIVATION — P0 DATA INTEGRITY / AUTHORIZATION
-- 2026-09-08
--
-- Objetivos:
-- 1) impedir alteração direta de XP/level no profile;
-- 2) fechar policy antiga de UPDATE global do catálogo;
-- 3) remover INSERT genérico de notificações/atividades de sistema;
-- 4) transformar trades/purchase_offers em máquinas de estado server-side;
-- 5) validar propriedade/disponibilidade ao criar proposta/oferta.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILE: usuário pode editar apenas colunas de perfil/UX.
-- XP e level ficam exclusivamente sob controle do servidor.
-- ------------------------------------------------------------
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (
  username,
  display_name,
  avatar_url,
  bio,
  favorite_genres,
  content_types,
  instagram,
  tiktok,
  twitter,
  website,
  profile_visibility,
  library_visibility,
  onboarded_at,
  tutorial_completed_at,
  tutorial_last_step
) ON TABLE public.profiles TO authenticated;

-- ------------------------------------------------------------
-- 2. BOOKS: remover policy permissiva histórica e recriar admin-only.
-- PostgreSQL OR-combina policies permissivas, portanto a policy antiga
-- precisa ser removida explicitamente.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS books_update_auth ON public.books;
DROP POLICY IF EXISTS books_update_authenticated ON public.books;
DROP POLICY IF EXISTS books_update_admin ON public.books;
CREATE POLICY books_update_admin
ON public.books
FOR UPDATE
TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)))
WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)));

DROP POLICY IF EXISTS books_insert_auth ON public.books;
DROP POLICY IF EXISTS books_insert_admin ON public.books;
CREATE POLICY books_insert_admin
ON public.books
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  AND length(trim(title)) > 0
);

-- ------------------------------------------------------------
-- 3. SYSTEM EVENTS: SECURITY DEFINER triggers não precisam de uma
-- policy genérica para que clientes forjem notificações/atividades.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS notifications_insert_system_kinds ON public.notifications;
DROP POLICY IF EXISTS activities_insert_system_kinds ON public.activities;

-- ------------------------------------------------------------
-- 4. TRADES: bloquear UPDATE/INSERT genérico do cliente.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS trades_update_participants ON public.trades;
DROP POLICY IF EXISTS trades_insert_self ON public.trades;

CREATE OR REPLACE FUNCTION public.create_trade_proposal(
  _receiver_id uuid,
  _proposer_book_id uuid,
  _receiver_book_id uuid,
  _message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  new_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _receiver_id IS NULL OR _receiver_id = uid THEN
    RAISE EXCEPTION 'invalid_receiver';
  END IF;
  IF _proposer_book_id IS NULL OR _receiver_book_id IS NULL THEN
    RAISE EXCEPTION 'invalid_books';
  END IF;
  IF _message IS NOT NULL AND length(_message) > 500 THEN
    RAISE EXCEPTION 'message_too_long';
  END IF;

  -- O proponente só pode oferecer livro que realmente possui e marcou para troca.
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_books ub
    WHERE ub.user_id = uid
      AND ub.book_id = _proposer_book_id
      AND ub.available_for_trade IS TRUE
  ) THEN
    RAISE EXCEPTION 'proposer_book_not_available';
  END IF;

  -- O receptor só pode ter seu livro usado na proposta quando o item é público
  -- e está de fato disponível para troca.
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_books ub
    WHERE ub.user_id = _receiver_id
      AND ub.book_id = _receiver_book_id
      AND ub.available_for_trade IS TRUE
      AND ub.is_public IS TRUE
  ) THEN
    RAISE EXCEPTION 'receiver_book_not_available';
  END IF;

  INSERT INTO public.trades (
    proposer_id, receiver_id, proposer_book_id, receiver_book_id, message, status
  ) VALUES (
    uid,
    _receiver_id,
    _proposer_book_id,
    _receiver_book_id,
    NULLIF(trim(COALESCE(_message, '')), ''),
    'pending'::public.trade_status
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_trade_proposal(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_trade_proposal(uuid, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_trade(
  _trade_id uuid,
  _next_status text
)
RETURNS public.trade_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  t public.trades%ROWTYPE;
  target public.trade_status;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _next_status NOT IN ('accepted','declined','completed','cancelled') THEN
    RAISE EXCEPTION 'invalid_transition';
  END IF;
  target := _next_status::public.trade_status;

  SELECT * INTO t
  FROM public.trades
  WHERE id = _trade_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'trade_not_found'; END IF;
  IF uid <> t.proposer_id AND uid <> t.receiver_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF t.status = 'pending'::public.trade_status THEN
    IF target IN ('accepted'::public.trade_status, 'declined'::public.trade_status)
       AND uid <> t.receiver_id THEN
      RAISE EXCEPTION 'receiver_only';
    END IF;
    IF target = 'cancelled'::public.trade_status AND uid <> t.proposer_id THEN
      RAISE EXCEPTION 'proposer_only';
    END IF;
    IF target NOT IN (
      'accepted'::public.trade_status,
      'declined'::public.trade_status,
      'cancelled'::public.trade_status
    ) THEN
      RAISE EXCEPTION 'invalid_transition';
    END IF;
  ELSIF t.status = 'accepted'::public.trade_status THEN
    IF target <> 'completed'::public.trade_status THEN
      RAISE EXCEPTION 'invalid_transition';
    END IF;
  ELSE
    RAISE EXCEPTION 'terminal_trade';
  END IF;

  UPDATE public.trades
  SET status = target
  WHERE id = _trade_id;

  RETURN target;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_trade(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_trade(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- 5. TRADE MATCH: cliente só pode dispensar o próprio match.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS trade_matches_update_involved ON public.trade_matches;

CREATE OR REPLACE FUNCTION public.dismiss_trade_match(_match_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  UPDATE public.trade_matches
  SET status = 'dismissed', resolved_at = now()
  WHERE id = _match_id
    AND status = 'pending'
    AND (offerer_id = uid OR wisher_id = uid);

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_trade_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_trade_match(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 6. PURCHASE OFFERS: sem INSERT/UPDATE genérico.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS po_insert_offerer ON public.purchase_offers;
DROP POLICY IF EXISTS po_update_involved ON public.purchase_offers;

CREATE OR REPLACE FUNCTION public.create_purchase_offer(
  _receiver_id uuid,
  _book_id uuid,
  _amount_cents integer,
  _message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  new_id uuid;
  sender_name text;
  book_title text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _receiver_id IS NULL OR _receiver_id = uid THEN RAISE EXCEPTION 'invalid_receiver'; END IF;
  IF _book_id IS NULL THEN RAISE EXCEPTION 'invalid_book'; END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 OR _amount_cents > 10000000 THEN
    RAISE EXCEPTION 'invalid_amount';
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
    uid,
    _receiver_id,
    _book_id,
    _amount_cents,
    'BRL',
    NULLIF(trim(COALESCE(_message, '')), ''),
    'pending'
  )
  RETURNING id INTO new_id;

  SELECT COALESCE(display_name, username, 'Alguém')
  INTO sender_name
  FROM public.profiles
  WHERE id = uid;

  SELECT title INTO book_title FROM public.books WHERE id = _book_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  VALUES (
    _receiver_id,
    'purchase_offer',
    COALESCE(sender_name, 'Alguém') || ' quer comprar ' || COALESCE(book_title, 'seu livro'),
    'Você recebeu uma nova oferta de compra.',
    '/trocas?tab=offers',
    jsonb_build_object(
      'offer_id', new_id,
      'from_user_id', uid,
      'book_id', _book_id,
      'amount_cents', _amount_cents,
      'currency', 'BRL'
    )
  );

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_offer(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_offer(uuid, uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_purchase_offer(
  _offer_id uuid,
  _next_status text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  o public.purchase_offers%ROWTYPE;
  responder_name text;
  book_title text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _next_status NOT IN ('accepted','declined','cancelled') THEN
    RAISE EXCEPTION 'invalid_transition';
  END IF;

  SELECT * INTO o
  FROM public.purchase_offers
  WHERE id = _offer_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'offer_not_found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'terminal_offer'; END IF;

  IF _next_status IN ('accepted','declined') THEN
    IF uid <> o.receiver_id THEN RAISE EXCEPTION 'receiver_only'; END IF;
  ELSIF _next_status = 'cancelled' THEN
    IF uid <> o.offerer_id THEN RAISE EXCEPTION 'offerer_only'; END IF;
  END IF;

  UPDATE public.purchase_offers
  SET status = _next_status,
      responded_at = CASE WHEN _next_status IN ('accepted','declined') THEN now() ELSE responded_at END
  WHERE id = _offer_id;

  IF _next_status IN ('accepted','declined') THEN
    SELECT COALESCE(display_name, username, 'A pessoa')
      INTO responder_name
    FROM public.profiles
    WHERE id = uid;

    SELECT title INTO book_title FROM public.books WHERE id = o.book_id;

    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    VALUES (
      o.offerer_id,
      'purchase_offer_response',
      COALESCE(responder_name, 'A pessoa') || CASE
        WHEN _next_status = 'accepted' THEN ' aceitou sua oferta'
        ELSE ' recusou sua oferta'
      END,
      CASE WHEN book_title IS NULL THEN NULL ELSE 'Livro: ' || book_title END,
      '/trocas?tab=offers',
      jsonb_build_object('offer_id', o.id, 'status', _next_status, 'book_id', o.book_id)
    );
  END IF;

  RETURN _next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_purchase_offer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_purchase_offer(uuid, text) TO authenticated;

-- po_delete_offerer pode permanecer como compatibilidade para pending;
-- após migração do front, cancelamento preferencial passa pela RPC acima.
