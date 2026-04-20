-- 1) INVITES: restringe INSERT à role 'authenticated' (era 'public')
DROP POLICY IF EXISTS "invites_insert_own" ON public.invites;
CREATE POLICY "invites_insert_own"
  ON public.invites
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2) CLUB_MEMBERS: SELECT restrito a membros do clube OU clubes públicos
DROP POLICY IF EXISTS "members_select" ON public.club_members;
CREATE POLICY "members_select"
  ON public.club_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_club_member(club_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.book_clubs bc
      WHERE bc.id = club_members.club_id AND bc.is_public = true
    )
  );

-- 3) REDEEM_INVITE: bloqueia chamada em nome de outro usuário
CREATE OR REPLACE FUNCTION public.redeem_invite(_code text, _new_user_id uuid)
RETURNS TABLE(success boolean, inviter_id uuid, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inviter uuid;
BEGIN
  -- CRITICAL: caller must be the new user themselves
  IF auth.uid() IS NULL OR auth.uid() <> _new_user_id THEN
    RETURN QUERY SELECT false, NULL::uuid, 'forbidden'::text;
    RETURN;
  END IF;

  SELECT user_id INTO v_inviter FROM public.invites WHERE code = _code;
  IF v_inviter IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'invalid_code'::text;
    RETURN;
  END IF;

  IF v_inviter = _new_user_id THEN
    RETURN QUERY SELECT false, NULL::uuid, 'cannot_self_invite'::text;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.invite_redemptions WHERE invitee_id = _new_user_id) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'already_redeemed'::text;
    RETURN;
  END IF;

  INSERT INTO public.invite_redemptions (code, inviter_id, invitee_id)
  VALUES (_code, v_inviter, _new_user_id);

  UPDATE public.invites
  SET signups_count = signups_count + 1,
      xp_earned = xp_earned + 200
  WHERE code = _code;

  PERFORM public.add_xp(v_inviter, 200, 'invite_redeemed', jsonb_build_object('invitee_id', _new_user_id));
  PERFORM public.add_xp(_new_user_id, 100, 'invite_signup_bonus', jsonb_build_object('inviter_id', v_inviter));

  RETURN QUERY SELECT true, v_inviter, 'ok'::text;
END;
$$;