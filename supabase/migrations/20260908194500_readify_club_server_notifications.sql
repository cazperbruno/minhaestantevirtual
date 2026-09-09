-- ============================================================
-- READIFY — CLUB NOTIFICATIONS ARE SERVER-GENERATED
-- 2026-09-08
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_club_invitation_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_name text;
  v_inviter_name text;
BEGIN
  SELECT name INTO v_club_name
  FROM public.book_clubs
  WHERE id = NEW.club_id;

  SELECT COALESCE(display_name, username, 'Um leitor')
    INTO v_inviter_name
  FROM public.profiles
  WHERE id = NEW.invited_by;

  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  VALUES (
    NEW.invitee_id,
    'club_invitation',
    'Convite para ' || COALESCE(v_club_name, 'um clube'),
    COALESCE(v_inviter_name, 'Um leitor') || ' convidou você para participar.',
    '/clubes/' || NEW.club_id::text,
    jsonb_build_object(
      'club_id', NEW.club_id,
      'invitation_id', NEW.id,
      'invited_by', NEW.invited_by
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_club_invitation_created ON public.club_invitations;
CREATE TRIGGER trg_notify_club_invitation_created
AFTER INSERT ON public.club_invitations
FOR EACH ROW EXECUTE FUNCTION public.notify_club_invitation_created();

CREATE OR REPLACE FUNCTION public.notify_club_join_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_club_name text;
  v_requester_name text;
BEGIN
  SELECT owner_id, name
    INTO v_owner_id, v_club_name
  FROM public.book_clubs
  WHERE id = NEW.club_id;

  IF v_owner_id IS NULL OR v_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, username, 'Um leitor')
    INTO v_requester_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  VALUES (
    v_owner_id,
    'club_join_request',
    'Pedido para entrar em ' || COALESCE(v_club_name, 'seu clube'),
    COALESCE(v_requester_name, 'Um leitor') || ' quer participar do clube.',
    '/clubes/' || NEW.club_id::text,
    jsonb_build_object(
      'club_id', NEW.club_id,
      'request_id', NEW.id,
      'requester_id', NEW.user_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_club_join_request_created ON public.club_join_requests;
CREATE TRIGGER trg_notify_club_join_request_created
AFTER INSERT ON public.club_join_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_club_join_request_created();
