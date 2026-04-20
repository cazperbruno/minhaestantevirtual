
-- ===========================================================
-- 1) JOIN REQUESTS (pedidos de entrada em clubes privados)
-- ===========================================================
CREATE TABLE IF NOT EXISTS public.club_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.book_clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  UNIQUE (club_id, user_id)
);

ALTER TABLE public.club_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "join_requests_select_involved"
  ON public.club_join_requests FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.book_clubs bc WHERE bc.id = club_id AND bc.owner_id = auth.uid())
  );

CREATE POLICY "join_requests_insert_self"
  ON public.club_join_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "join_requests_update_owner_or_self"
  ON public.club_join_requests FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.book_clubs bc WHERE bc.id = club_id AND bc.owner_id = auth.uid())
  );

CREATE POLICY "join_requests_delete_self_or_owner"
  ON public.club_join_requests FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.book_clubs bc WHERE bc.id = club_id AND bc.owner_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_join_requests_club ON public.club_join_requests(club_id, status);
CREATE INDEX IF NOT EXISTS idx_join_requests_user ON public.club_join_requests(user_id, status);

-- ===========================================================
-- 2) INVITATIONS (convites diretos para entrar)
-- ===========================================================
CREATE TABLE IF NOT EXISTS public.club_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.book_clubs(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (club_id, invitee_id)
);

ALTER TABLE public.club_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_select_involved"
  ON public.club_invitations FOR SELECT
  USING (
    auth.uid() = invitee_id
    OR auth.uid() = invited_by
    OR EXISTS (SELECT 1 FROM public.book_clubs bc WHERE bc.id = club_id AND bc.owner_id = auth.uid())
  );

CREATE POLICY "invitations_insert_owner_or_member"
  ON public.club_invitations FOR INSERT
  WITH CHECK (
    auth.uid() = invited_by
    AND public.is_club_member(club_id, auth.uid())
  );

CREATE POLICY "invitations_update_invitee_or_owner"
  ON public.club_invitations FOR UPDATE
  USING (
    auth.uid() = invitee_id
    OR EXISTS (SELECT 1 FROM public.book_clubs bc WHERE bc.id = club_id AND bc.owner_id = auth.uid())
  );

CREATE POLICY "invitations_delete_owner_or_invitee"
  ON public.club_invitations FOR DELETE
  USING (
    auth.uid() = invitee_id
    OR auth.uid() = invited_by
    OR EXISTS (SELECT 1 FROM public.book_clubs bc WHERE bc.id = club_id AND bc.owner_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_invitations_club ON public.club_invitations(club_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_invitee ON public.club_invitations(invitee_id, status);

-- ===========================================================
-- 3) HELPER FUNCTIONS
-- ===========================================================
CREATE OR REPLACE FUNCTION public.has_pending_club_invite(_club uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_invitations
    WHERE club_id = _club AND invitee_id = _user AND status = 'pending'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_pending_club_request(_club uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_join_requests
    WHERE club_id = _club AND user_id = _user AND status = 'pending'
  )
$$;

-- Aprovar pedido (admin) — adiciona como membro automaticamente
CREATE OR REPLACE FUNCTION public.approve_club_request(_request_id uuid)
RETURNS TABLE(success boolean, message text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  req record; club record;
BEGIN
  SELECT * INTO req FROM public.club_join_requests WHERE id = _request_id;
  IF req IS NULL THEN RETURN QUERY SELECT false, 'not_found'::text; RETURN; END IF;
  SELECT * INTO club FROM public.book_clubs WHERE id = req.club_id;
  IF club.owner_id <> auth.uid() THEN RETURN QUERY SELECT false, 'forbidden'::text; RETURN; END IF;
  IF req.status <> 'pending' THEN RETURN QUERY SELECT false, 'already_decided'::text; RETURN; END IF;

  UPDATE public.club_join_requests
    SET status = 'approved', decided_at = now(), decided_by = auth.uid()
    WHERE id = _request_id;

  INSERT INTO public.club_members (club_id, user_id, role)
    VALUES (req.club_id, req.user_id, 'member')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (req.user_id, 'club_request_approved', 'Pedido aprovado!',
            'Você agora é membro de "' || club.name || '"',
            '/clubes/' || club.id);

  RETURN QUERY SELECT true, 'ok'::text;
END $$;

-- Recusar pedido
CREATE OR REPLACE FUNCTION public.reject_club_request(_request_id uuid)
RETURNS TABLE(success boolean, message text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE req record; club record;
BEGIN
  SELECT * INTO req FROM public.club_join_requests WHERE id = _request_id;
  IF req IS NULL THEN RETURN QUERY SELECT false, 'not_found'::text; RETURN; END IF;
  SELECT * INTO club FROM public.book_clubs WHERE id = req.club_id;
  IF club.owner_id <> auth.uid() THEN RETURN QUERY SELECT false, 'forbidden'::text; RETURN; END IF;

  UPDATE public.club_join_requests
    SET status = 'rejected', decided_at = now(), decided_by = auth.uid()
    WHERE id = _request_id;

  RETURN QUERY SELECT true, 'ok'::text;
END $$;

-- Aceitar convite (convidado)
CREATE OR REPLACE FUNCTION public.accept_club_invitation(_invitation_id uuid)
RETURNS TABLE(success boolean, message text, club_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record;
BEGIN
  SELECT * INTO inv FROM public.club_invitations WHERE id = _invitation_id;
  IF inv IS NULL THEN RETURN QUERY SELECT false, 'not_found'::text, NULL::uuid; RETURN; END IF;
  IF inv.invitee_id <> auth.uid() THEN RETURN QUERY SELECT false, 'forbidden'::text, NULL::uuid; RETURN; END IF;
  IF inv.status <> 'pending' THEN RETURN QUERY SELECT false, 'already_decided'::text, inv.club_id; RETURN; END IF;

  UPDATE public.club_invitations
    SET status = 'accepted', responded_at = now()
    WHERE id = _invitation_id;

  INSERT INTO public.club_members (club_id, user_id, role)
    VALUES (inv.club_id, inv.invitee_id, 'member')
    ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT true, 'ok'::text, inv.club_id;
END $$;

-- Recusar convite
CREATE OR REPLACE FUNCTION public.decline_club_invitation(_invitation_id uuid)
RETURNS TABLE(success boolean, message text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record;
BEGIN
  SELECT * INTO inv FROM public.club_invitations WHERE id = _invitation_id;
  IF inv IS NULL THEN RETURN QUERY SELECT false, 'not_found'::text; RETURN; END IF;
  IF inv.invitee_id <> auth.uid() THEN RETURN QUERY SELECT false, 'forbidden'::text; RETURN; END IF;

  UPDATE public.club_invitations
    SET status = 'declined', responded_at = now()
    WHERE id = _invitation_id;

  RETURN QUERY SELECT true, 'ok'::text;
END $$;

-- ===========================================================
-- 4) ATUALIZAR RLS DE BOOK_CLUBS — clubes privados visíveis
--    para dono, membros, convidados ou solicitantes
-- ===========================================================
DROP POLICY IF EXISTS "clubs_select" ON public.book_clubs;
CREATE POLICY "clubs_select"
  ON public.book_clubs FOR SELECT
  USING (
    is_public = true
    OR owner_id = auth.uid()
    OR public.is_club_member(id, auth.uid())
    OR public.has_pending_club_invite(id, auth.uid())
    OR public.has_pending_club_request(id, auth.uid())
  );

-- Restringir entrada direta em clubes privados:
-- só pode adicionar-se como membro se for dono OU clube público OU tiver convite aceito (já viraria membro via função)
DROP POLICY IF EXISTS "members_insert_self" ON public.club_members;
CREATE POLICY "members_insert_self"
  ON public.club_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      EXISTS (SELECT 1 FROM public.book_clubs bc WHERE bc.id = club_id AND (bc.is_public = true OR bc.owner_id = auth.uid()))
    )
  );

-- ===========================================================
-- 5) GAMIFICAÇÃO: substituir grant_xp por add_xp em check_achievements
-- ===========================================================
CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)
RETURNS TABLE(unlocked_code text, title text, xp_reward integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lib_count int; finished_count int; review_count int; loan_count int;
  ach record;
BEGIN
  SELECT count(*) INTO lib_count FROM public.user_books WHERE user_id = _user_id;
  SELECT count(*) INTO finished_count FROM public.user_books WHERE user_id = _user_id AND status = 'read';
  SELECT count(*) INTO review_count FROM public.reviews WHERE user_id = _user_id;
  SELECT count(*) INTO loan_count FROM public.loans WHERE user_id = _user_id;

  FOR ach IN SELECT * FROM public.achievements LOOP
    IF EXISTS (SELECT 1 FROM public.user_achievements WHERE user_id = _user_id AND achievement_code = ach.code) THEN
      CONTINUE;
    END IF;
    IF (ach.category = 'library' AND lib_count >= ach.threshold)
       OR (ach.category = 'reading' AND finished_count >= ach.threshold)
       OR (ach.category = 'social' AND review_count >= ach.threshold)
       OR (ach.category = 'loans' AND loan_count >= ach.threshold) THEN
      INSERT INTO public.user_achievements (user_id, achievement_code) VALUES (_user_id, ach.code);
      -- Usar add_xp (registra xp_events) em vez do legacy grant_xp
      PERFORM public.add_xp(_user_id, ach.xp_reward, 'achievement', jsonb_build_object('code', ach.code));
      unlocked_code := ach.code; title := ach.title; xp_reward := ach.xp_reward;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;
