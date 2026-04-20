
-- Trigger: notificar o dono do clube quando uma nova solicitação de entrada é criada
CREATE OR REPLACE FUNCTION public.notify_club_join_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  club_rec record;
  applicant_name text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT id, name, owner_id INTO club_rec
  FROM public.book_clubs
  WHERE id = NEW.club_id;

  IF club_rec IS NULL OR club_rec.owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, username, 'Um leitor') INTO applicant_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  VALUES (
    club_rec.owner_id,
    'club_join_request',
    applicant_name || ' quer entrar em "' || club_rec.name || '"',
    'Abra o painel para aprovar ou recusar.',
    '/clubes/' || club_rec.id,
    jsonb_build_object('request_id', NEW.id, 'club_id', club_rec.id, 'user_id', NEW.user_id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_club_join_request ON public.club_join_requests;
CREATE TRIGGER trg_notify_club_join_request
AFTER INSERT ON public.club_join_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_club_join_request();

-- Garantir que notifications está na publicação realtime (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;
