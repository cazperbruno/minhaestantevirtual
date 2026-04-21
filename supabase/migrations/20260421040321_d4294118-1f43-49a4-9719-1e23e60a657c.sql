
-- =========================================================
-- BUDDY READING SYSTEM
-- =========================================================

-- 1) Sessões de buddy reading
CREATE TABLE public.buddy_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  initiator_id UUID NOT NULL,
  invitee_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','cancelled','declined')),
  target_finish_date DATE,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT buddy_reads_distinct CHECK (initiator_id <> invitee_id)
);

CREATE INDEX idx_buddy_reads_initiator ON public.buddy_reads(initiator_id);
CREATE INDEX idx_buddy_reads_invitee   ON public.buddy_reads(invitee_id);
CREATE INDEX idx_buddy_reads_book      ON public.buddy_reads(book_id);
CREATE INDEX idx_buddy_reads_status    ON public.buddy_reads(status);

-- 2) Participantes (progresso individual)
CREATE TABLE public.buddy_read_participants (
  buddy_read_id UUID NOT NULL REFERENCES public.buddy_reads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  current_page INTEGER NOT NULL DEFAULT 0,
  percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (buddy_read_id, user_id)
);

-- 3) Chat exclusivo da sessão
CREATE TABLE public.buddy_read_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buddy_read_id UUID NOT NULL REFERENCES public.buddy_reads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  spoiler_page INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_buddy_messages_buddy ON public.buddy_read_messages(buddy_read_id, created_at DESC);

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.buddy_reads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_read_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_read_messages     ENABLE ROW LEVEL SECURITY;

-- Helper: usuário é participante da sessão?
CREATE OR REPLACE FUNCTION public.is_buddy_participant(_buddy_id UUID, _user UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.buddy_reads br
    WHERE br.id = _buddy_id
      AND (br.initiator_id = _user OR br.invitee_id = _user)
  );
$$;

-- buddy_reads
CREATE POLICY buddy_reads_select_participants ON public.buddy_reads
  FOR SELECT USING (auth.uid() = initiator_id OR auth.uid() = invitee_id);

CREATE POLICY buddy_reads_insert_self ON public.buddy_reads
  FOR INSERT WITH CHECK (auth.uid() = initiator_id);

CREATE POLICY buddy_reads_update_participants ON public.buddy_reads
  FOR UPDATE USING (auth.uid() = initiator_id OR auth.uid() = invitee_id);

CREATE POLICY buddy_reads_delete_initiator ON public.buddy_reads
  FOR DELETE USING (auth.uid() = initiator_id);

-- buddy_read_participants
CREATE POLICY brp_select_participants ON public.buddy_read_participants
  FOR SELECT USING (public.is_buddy_participant(buddy_read_id, auth.uid()));

CREATE POLICY brp_insert_self ON public.buddy_read_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_buddy_participant(buddy_read_id, auth.uid()));

CREATE POLICY brp_update_self ON public.buddy_read_participants
  FOR UPDATE USING (auth.uid() = user_id);

-- buddy_read_messages
CREATE POLICY brm_select_participants ON public.buddy_read_messages
  FOR SELECT USING (public.is_buddy_participant(buddy_read_id, auth.uid()));

CREATE POLICY brm_insert_participant ON public.buddy_read_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_buddy_participant(buddy_read_id, auth.uid()));

CREATE POLICY brm_delete_own ON public.buddy_read_messages
  FOR DELETE USING (auth.uid() = user_id);

-- =========================================================
-- Achievement
-- =========================================================
INSERT INTO public.achievements (code, title, description, icon, category, threshold, xp_reward)
VALUES ('buddy_reader_1', 'Buddy Reader', 'Termine um livro junto com um amigo', 'Users', 'social', 1, 150)
ON CONFLICT (code) DO NOTHING;

-- =========================================================
-- RPCs
-- =========================================================

-- Aceitar convite: cria participantes e ativa
CREATE OR REPLACE FUNCTION public.accept_buddy_read(_buddy_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _br RECORD;
BEGIN
  SELECT * INTO _br FROM public.buddy_reads WHERE id = _buddy_id;
  IF _br IS NULL THEN
    RETURN QUERY SELECT false, 'Sessão não encontrada'; RETURN;
  END IF;
  IF _br.invitee_id <> auth.uid() THEN
    RETURN QUERY SELECT false, 'Apenas o convidado pode aceitar'; RETURN;
  END IF;
  IF _br.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'Convite já respondido'; RETURN;
  END IF;

  UPDATE public.buddy_reads
     SET status = 'active', started_at = now(), updated_at = now()
   WHERE id = _buddy_id;

  INSERT INTO public.buddy_read_participants (buddy_read_id, user_id)
  VALUES (_buddy_id, _br.initiator_id), (_buddy_id, _br.invitee_id)
  ON CONFLICT DO NOTHING;

  -- Notificação ao iniciador
  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  VALUES (_br.initiator_id, 'buddy_accepted', 'Buddy Reading aceito! 📚',
          'Sua leitura compartilhada começou.',
          '/buddy/' || _buddy_id::text,
          jsonb_build_object('buddy_read_id', _buddy_id));

  RETURN QUERY SELECT true, 'Leitura iniciada';
END;
$$;

-- Recusar convite
CREATE OR REPLACE FUNCTION public.decline_buddy_read(_buddy_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _br RECORD;
BEGIN
  SELECT * INTO _br FROM public.buddy_reads WHERE id = _buddy_id;
  IF _br IS NULL OR _br.invitee_id <> auth.uid() OR _br.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'Não permitido'; RETURN;
  END IF;
  UPDATE public.buddy_reads SET status = 'declined', updated_at = now() WHERE id = _buddy_id;
  RETURN QUERY SELECT true, 'Convite recusado';
END;
$$;

-- Atualizar progresso; se ambos terminam → completa + badge
CREATE OR REPLACE FUNCTION public.update_buddy_progress(
  _buddy_id UUID, _current_page INTEGER, _percent NUMERIC
)
RETURNS TABLE(success BOOLEAN, both_finished BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _br RECORD;
  _total INTEGER;
  _finished_count INTEGER;
  _is_finished BOOLEAN;
BEGIN
  SELECT * INTO _br FROM public.buddy_reads WHERE id = _buddy_id;
  IF _br IS NULL OR NOT public.is_buddy_participant(_buddy_id, auth.uid()) THEN
    RETURN QUERY SELECT false, false, 'Sem permissão'; RETURN;
  END IF;

  _is_finished := _percent >= 100;

  INSERT INTO public.buddy_read_participants (buddy_read_id, user_id, current_page, percent, finished_at, updated_at)
  VALUES (_buddy_id, auth.uid(), _current_page, _percent,
          CASE WHEN _is_finished THEN now() ELSE NULL END, now())
  ON CONFLICT (buddy_read_id, user_id) DO UPDATE
     SET current_page = EXCLUDED.current_page,
         percent      = EXCLUDED.percent,
         finished_at  = COALESCE(buddy_read_participants.finished_at, EXCLUDED.finished_at),
         updated_at   = now();

  SELECT COUNT(*), COUNT(*) FILTER (WHERE finished_at IS NOT NULL)
    INTO _total, _finished_count
    FROM public.buddy_read_participants WHERE buddy_read_id = _buddy_id;

  IF _total >= 2 AND _finished_count >= 2 AND _br.status = 'active' THEN
    UPDATE public.buddy_reads
       SET status = 'completed', completed_at = now(), updated_at = now()
     WHERE id = _buddy_id;

    -- Badge + XP para ambos
    INSERT INTO public.user_achievements (user_id, achievement_code)
    VALUES (_br.initiator_id, 'buddy_reader_1'), (_br.invitee_id, 'buddy_reader_1')
    ON CONFLICT DO NOTHING;

    PERFORM public.add_xp(_br.initiator_id, 150, 'buddy_complete', jsonb_build_object('buddy_read_id', _buddy_id));
    PERFORM public.add_xp(_br.invitee_id,   150, 'buddy_complete', jsonb_build_object('buddy_read_id', _buddy_id));

    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    VALUES
      (_br.initiator_id, 'buddy_completed', 'Vocês terminaram juntos! 🎉', 'Badge Buddy Reader desbloqueado.', '/buddy/' || _buddy_id::text, jsonb_build_object('buddy_read_id', _buddy_id)),
      (_br.invitee_id,   'buddy_completed', 'Vocês terminaram juntos! 🎉', 'Badge Buddy Reader desbloqueado.', '/buddy/' || _buddy_id::text, jsonb_build_object('buddy_read_id', _buddy_id));

    RETURN QUERY SELECT true, true, 'Leitura concluída — badge desbloqueado!';
    RETURN;
  END IF;

  RETURN QUERY SELECT true, false, 'Progresso atualizado';
END;
$$;

-- Listar buddy reads do usuário
CREATE OR REPLACE FUNCTION public.get_my_buddy_reads()
RETURNS TABLE(
  id UUID, status TEXT, book_id UUID, book_title TEXT, book_cover TEXT,
  partner_id UUID, partner_name TEXT, partner_avatar TEXT,
  my_percent NUMERIC, partner_percent NUMERIC,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ,
  is_initiator BOOLEAN
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    br.id, br.status,
    b.id, b.title, b.cover_url,
    CASE WHEN br.initiator_id = auth.uid() THEN br.invitee_id ELSE br.initiator_id END,
    p.display_name, p.avatar_url,
    COALESCE(me.percent, 0), COALESCE(other.percent, 0),
    br.started_at, br.completed_at, br.created_at,
    (br.initiator_id = auth.uid())
  FROM public.buddy_reads br
  JOIN public.books b ON b.id = br.book_id
  LEFT JOIN public.profiles p ON p.id = CASE WHEN br.initiator_id = auth.uid() THEN br.invitee_id ELSE br.initiator_id END
  LEFT JOIN public.buddy_read_participants me    ON me.buddy_read_id = br.id    AND me.user_id    = auth.uid()
  LEFT JOIN public.buddy_read_participants other ON other.buddy_read_id = br.id AND other.user_id = CASE WHEN br.initiator_id = auth.uid() THEN br.invitee_id ELSE br.initiator_id END
  WHERE br.initiator_id = auth.uid() OR br.invitee_id = auth.uid()
  ORDER BY
    CASE br.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
    COALESCE(br.started_at, br.created_at) DESC;
$$;

-- Trigger: notifica convidado ao criar buddy read
CREATE OR REPLACE FUNCTION public.notify_buddy_invite()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  VALUES (NEW.invitee_id, 'buddy_invite', 'Convite para Buddy Reading 📚',
          'Alguém quer ler um livro junto com você.',
          '/buddy/' || NEW.id::text,
          jsonb_build_object('buddy_read_id', NEW.id, 'book_id', NEW.book_id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_buddy_invite_notify
AFTER INSERT ON public.buddy_reads
FOR EACH ROW EXECUTE FUNCTION public.notify_buddy_invite();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.buddy_read_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.buddy_read_participants;
