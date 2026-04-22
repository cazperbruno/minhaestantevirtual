CREATE OR REPLACE FUNCTION public.club_report_data(_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _club record;
  _book record;
BEGIN
  IF NOT public.is_club_member(_club_id, auth.uid()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT id, name, description, owner_id, current_book_id, created_at,
         (SELECT COUNT(*) FROM public.club_members WHERE club_id = _club_id)::int AS members_count
    INTO _club
  FROM public.book_clubs WHERE id = _club_id;

  SELECT id, title, authors, page_count, cover_url INTO _book
  FROM public.books WHERE id = _club.current_book_id;

  WITH progress AS (
    SELECT * FROM public.club_book_progress(_club_id)
  ),
  weekly AS (
    SELECT
      to_char(date_trunc('week', cm.created_at), 'YYYY-MM-DD') AS week_start,
      COUNT(*)::int AS messages,
      COUNT(DISTINCT cm.user_id)::int AS active_users
    FROM public.club_messages cm
    WHERE cm.club_id = _club_id
      AND cm.created_at > now() - interval '6 weeks'
    GROUP BY 1
    ORDER BY 1
  ),
  top_ranking AS (
    SELECT row_to_json(t)::jsonb AS row
    FROM (
      SELECT * FROM public.club_leaderboard(_club_id) LIMIT 10
    ) t
  )
  SELECT jsonb_build_object(
    'club', jsonb_build_object(
      'id', _club.id,
      'name', _club.name,
      'description', _club.description,
      'members_count', _club.members_count,
      'created_at', _club.created_at
    ),
    'current_book', CASE WHEN _book.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', _book.id,
      'title', _book.title,
      'authors', _book.authors,
      'page_count', _book.page_count,
      'cover_url', _book.cover_url
    ) END,
    'progress', (SELECT row_to_json(progress)::jsonb FROM progress LIMIT 1),
    'weekly', COALESCE((SELECT jsonb_agg(row_to_json(weekly)::jsonb) FROM weekly), '[]'::jsonb),
    'ranking', COALESCE((SELECT jsonb_agg(row) FROM top_ranking), '[]'::jsonb),
    'generated_at', now()
  )
  INTO _result;

  RETURN _result;
END;
$function$;

-- =====================================================================
-- READING SPRINTS — sessões cronometradas de leitura em grupo
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.club_reading_sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.book_clubs(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes IN (15, 30, 45, 60)),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'cancelled')),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sprints_club_status ON public.club_reading_sprints(club_id, status, ends_at DESC);

CREATE TABLE IF NOT EXISTS public.club_reading_sprint_participants (
  sprint_id uuid NOT NULL REFERENCES public.club_reading_sprints(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  pages_start int NOT NULL DEFAULT 0,
  pages_end int,
  pages_read int GENERATED ALWAYS AS (GREATEST(0, COALESCE(pages_end, pages_start) - pages_start)) STORED,
  PRIMARY KEY (sprint_id, user_id)
);

ALTER TABLE public.club_reading_sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_reading_sprint_participants ENABLE ROW LEVEL SECURITY;

-- Membros podem ver os sprints do clube
CREATE POLICY "Members view club sprints"
  ON public.club_reading_sprints
  FOR SELECT
  USING (public.is_club_member(club_id, auth.uid()));

-- Qualquer membro pode iniciar um sprint
CREATE POLICY "Members create sprints"
  ON public.club_reading_sprints
  FOR INSERT
  WITH CHECK (public.is_club_member(club_id, auth.uid()) AND created_by = auth.uid());

-- Criador ou dono do clube pode encerrar
CREATE POLICY "Creator or owner update sprint"
  ON public.club_reading_sprints
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.book_clubs c WHERE c.id = club_id AND c.owner_id = auth.uid())
  );

CREATE POLICY "Members view sprint participants"
  ON public.club_reading_sprint_participants
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.club_reading_sprints s
    WHERE s.id = sprint_id AND public.is_club_member(s.club_id, auth.uid())
  ));

CREATE POLICY "Members join sprint"
  ON public.club_reading_sprint_participants
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.club_reading_sprints s
      WHERE s.id = sprint_id AND s.status = 'active' AND public.is_club_member(s.club_id, auth.uid())
    )
  );

CREATE POLICY "Owner of progress updates"
  ON public.club_reading_sprint_participants
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Owner of progress deletes"
  ON public.club_reading_sprint_participants
  FOR DELETE
  USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.club_reading_sprints;
ALTER PUBLICATION supabase_realtime ADD TABLE public.club_reading_sprint_participants;

-- Função para iniciar sprint (calcula ends_at)
CREATE OR REPLACE FUNCTION public.start_reading_sprint(_club_id uuid, _duration int)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sprint_id uuid;
BEGIN
  IF NOT public.is_club_member(_club_id, auth.uid()) THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  IF _duration NOT IN (15, 30, 45, 60) THEN
    RAISE EXCEPTION 'invalid duration';
  END IF;
  -- Encerra sprints ativos antigos do clube
  UPDATE public.club_reading_sprints
     SET status = 'finished', finished_at = now()
   WHERE club_id = _club_id AND status = 'active' AND ends_at < now();

  INSERT INTO public.club_reading_sprints(club_id, created_by, duration_minutes, ends_at)
  VALUES (_club_id, auth.uid(), _duration, now() + (_duration || ' minutes')::interval)
  RETURNING id INTO _sprint_id;

  -- Criador entra automaticamente
  INSERT INTO public.club_reading_sprint_participants(sprint_id, user_id)
  VALUES (_sprint_id, auth.uid())
  ON CONFLICT DO NOTHING;

  -- Notifica membros
  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  SELECT cm.user_id, 'club_sprint_started',
         'Sprint de leitura começou! ⏱️',
         'Junte-se ao grupo nos próximos ' || _duration || ' min',
         '/clubes/' || _club_id::text,
         jsonb_build_object('sprint_id', _sprint_id, 'duration', _duration)
    FROM public.club_members cm
   WHERE cm.club_id = _club_id AND cm.user_id <> auth.uid();

  RETURN _sprint_id;
END;
$$;

-- Função para encerrar sprint manualmente
CREATE OR REPLACE FUNCTION public.finish_reading_sprint(_sprint_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.club_reading_sprints
     SET status = 'finished', finished_at = now()
   WHERE id = _sprint_id
     AND (created_by = auth.uid() OR EXISTS (
       SELECT 1 FROM public.book_clubs c WHERE c.id = club_id AND c.owner_id = auth.uid()
     ));
END;
$$;