-- ============================================================
-- RANKING DE LEITURA + RELATÓRIO DO CLUBE
-- ============================================================

-- Helper: garante que quem chamou é membro do clube
CREATE OR REPLACE FUNCTION public.club_leaderboard(_club_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  is_owner boolean,
  pages_read int,
  finished_book boolean,
  messages_count int,
  reactions_given int,
  reactions_received int,
  nominations_count int,
  votes_received int,
  total_points int,
  level int,
  achievements text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_book uuid;
  _book_pages int;
  _owner uuid;
BEGIN
  -- gate: apenas membros (ou owner) podem ler
  IF NOT public.is_club_member(_club_id, auth.uid()) THEN
    RETURN;
  END IF;

  SELECT bc.current_book_id, bc.owner_id INTO _current_book, _owner
  FROM public.book_clubs bc WHERE bc.id = _club_id;

  SELECT b.page_count INTO _book_pages
  FROM public.books b WHERE b.id = _current_book;

  RETURN QUERY
  WITH base AS (
    SELECT cm.user_id
    FROM public.club_members cm
    WHERE cm.club_id = _club_id
  ),
  reading AS (
    SELECT ub.user_id,
           CASE
             WHEN ub.status = 'read' THEN COALESCE(_book_pages, ub.current_page, 0)
             ELSE COALESCE(ub.current_page, 0)
           END AS pages,
           (ub.status = 'read') AS finished
    FROM public.user_books ub
    WHERE _current_book IS NOT NULL
      AND ub.book_id = _current_book
      AND ub.user_id IN (SELECT user_id FROM base)
  ),
  msgs AS (
    SELECT cm.user_id, COUNT(*)::int AS n
    FROM public.club_messages cm
    WHERE cm.club_id = _club_id
      AND cm.created_at > now() - interval '30 days'
    GROUP BY cm.user_id
  ),
  reacts_given AS (
    SELECT r.user_id, COUNT(*)::int AS n
    FROM public.club_message_reactions r
    JOIN public.club_messages cm2 ON cm2.id = r.message_id
    WHERE cm2.club_id = _club_id
    GROUP BY r.user_id
  ),
  reacts_recv AS (
    SELECT cm2.user_id, COUNT(*)::int AS n
    FROM public.club_message_reactions r
    JOIN public.club_messages cm2 ON cm2.id = r.message_id
    WHERE cm2.club_id = _club_id
    GROUP BY cm2.user_id
  ),
  noms AS (
    SELECT n.nominated_by AS user_id, COUNT(*)::int AS n
    FROM public.club_book_nominations n
    WHERE n.club_id = _club_id
    GROUP BY n.nominated_by
  ),
  votes_recv AS (
    SELECT n.nominated_by AS user_id, COALESCE(SUM(n.votes_count), 0)::int AS n
    FROM public.club_book_nominations n
    WHERE n.club_id = _club_id
    GROUP BY n.nominated_by
  ),
  scored AS (
    SELECT
      b.user_id,
      COALESCE(r.pages, 0) AS pages_read,
      COALESCE(r.finished, false) AS finished_book,
      COALESCE(m.n, 0) AS messages_count,
      COALESCE(rg.n, 0) AS reactions_given,
      COALESCE(rr.n, 0) AS reactions_received,
      COALESCE(no.n, 0) AS nominations_count,
      COALESCE(vr.n, 0) AS votes_received,
      (
        COALESCE(r.pages, 0)
        + CASE WHEN COALESCE(r.finished, false) THEN 150 ELSE 0 END
        + COALESCE(m.n, 0) * 5
        + COALESCE(rg.n, 0) * 2
        + COALESCE(rr.n, 0) * 3
        + COALESCE(no.n, 0) * 10
        + COALESCE(vr.n, 0) * 4
      )::int AS total_points
    FROM base b
    LEFT JOIN reading r ON r.user_id = b.user_id
    LEFT JOIN msgs m ON m.user_id = b.user_id
    LEFT JOIN reacts_given rg ON rg.user_id = b.user_id
    LEFT JOIN reacts_recv rr ON rr.user_id = b.user_id
    LEFT JOIN noms no ON no.user_id = b.user_id
    LEFT JOIN votes_recv vr ON vr.user_id = b.user_id
  )
  SELECT
    s.user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    (s.user_id = _owner) AS is_owner,
    s.pages_read,
    s.finished_book,
    s.messages_count,
    s.reactions_given,
    s.reactions_received,
    s.nominations_count,
    s.votes_received,
    s.total_points,
    GREATEST(1, (s.total_points / 500) + 1) AS level,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN s.pages_read >= 200 THEN 'Maratonista' END,
      CASE WHEN s.messages_count >= 25 THEN 'Conversador' END,
      CASE WHEN s.nominations_count >= 3 THEN 'Curador' END,
      CASE WHEN s.reactions_received >= 20 THEN 'Influenciador' END,
      CASE WHEN s.finished_book THEN 'Concluidor' END
    ], NULL) AS achievements
  FROM scored s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  ORDER BY s.total_points DESC, s.pages_read DESC;
END;
$$;

-- Pacote para o relatório PDF (admin do clube)
CREATE OR REPLACE FUNCTION public.club_report_data(_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT id, title, authors, page_count INTO _book
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
      'page_count', _book.page_count
    ) END,
    'progress', (SELECT row_to_json(progress)::jsonb FROM progress LIMIT 1),
    'weekly', COALESCE((SELECT jsonb_agg(row_to_json(weekly)::jsonb) FROM weekly), '[]'::jsonb),
    'ranking', COALESCE((SELECT jsonb_agg(row) FROM top_ranking), '[]'::jsonb),
    'generated_at', now()
  )
  INTO _result;

  RETURN _result;
END;
$$;