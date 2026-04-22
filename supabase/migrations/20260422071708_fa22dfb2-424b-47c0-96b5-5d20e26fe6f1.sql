-- =========================================================
-- Wave 4 — Engajamento social automatizado nos clubes
-- =========================================================

-- ---------- 1. Trigger: notificação + XP em reação recebida ----------
CREATE OR REPLACE FUNCTION public.notify_reaction_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg_owner uuid;
  v_club_id uuid;
  v_reactor_name text;
  v_msg_preview text;
BEGIN
  SELECT m.user_id, m.club_id, LEFT(m.content, 60)
    INTO v_msg_owner, v_club_id, v_msg_preview
    FROM public.club_messages m
   WHERE m.id = NEW.message_id;

  -- Não notifica nem dá XP por reagir à própria mensagem
  IF v_msg_owner IS NULL OR v_msg_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.display_name, p.username, 'alguém')
    INTO v_reactor_name
    FROM public.profiles p
   WHERE p.id = NEW.user_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  VALUES (
    v_msg_owner,
    'club_reaction',
    COALESCE(v_reactor_name, 'Alguém') || ' reagiu ' || NEW.emoji,
    'na sua mensagem: "' || COALESCE(v_msg_preview, '...') || '"',
    '/clubes/' || v_club_id::text,
    jsonb_build_object(
      'club_id', v_club_id,
      'message_id', NEW.message_id,
      'emoji', NEW.emoji,
      'from_user_id', NEW.user_id
    )
  );

  -- +3 XP por reação recebida (quase invisível no toast, mas conta no ranking)
  PERFORM public.add_xp(v_msg_owner, 3, 'club_reaction_received',
    jsonb_build_object('club_id', v_club_id, 'message_id', NEW.message_id));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_reaction_received ON public.club_message_reactions;
CREATE TRIGGER trg_notify_reaction_received
AFTER INSERT ON public.club_message_reactions
FOR EACH ROW EXECUTE FUNCTION public.notify_reaction_received();

-- A policy de INSERT em notifications já tinha permissão só para club_invitation;
-- como nosso trigger é SECURITY DEFINER e o owner (postgres) bypassa RLS,
-- não precisa nova policy — INSERT funciona via definer.

-- ---------- 2. Trigger: notificação + XP em @menção ----------
CREATE OR REPLACE FUNCTION public.notify_message_mentions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match text;
  v_username text;
  v_target uuid;
  v_author_name text;
  v_seen uuid[] := ARRAY[]::uuid[];
BEGIN
  -- Pega nome legível do autor uma vez
  SELECT COALESCE(p.display_name, p.username, 'um leitor')
    INTO v_author_name
    FROM public.profiles p
   WHERE p.id = NEW.user_id;

  FOR v_match IN
    SELECT regexp_matches(NEW.content, '@([A-Za-z0-9_\.]{2,30})', 'g')
  LOOP
    v_username := lower(v_match);

    SELECT p.id INTO v_target
      FROM public.profiles p
     WHERE lower(p.username) = v_username
     LIMIT 1;

    IF v_target IS NULL OR v_target = NEW.user_id OR v_target = ANY(v_seen) THEN
      CONTINUE;
    END IF;

    -- Só notifica se o mencionado for membro do clube
    IF NOT public.is_club_member(NEW.club_id, v_target) THEN
      CONTINUE;
    END IF;

    v_seen := array_append(v_seen, v_target);

    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    VALUES (
      v_target,
      'club_mention',
      COALESCE(v_author_name, 'Alguém') || ' te mencionou no clube',
      LEFT(NEW.content, 120),
      '/clubes/' || NEW.club_id::text,
      jsonb_build_object(
        'club_id', NEW.club_id,
        'message_id', NEW.id,
        'from_user_id', NEW.user_id
      )
    );

    PERFORM public.add_xp(v_target, 2, 'club_mention',
      jsonb_build_object('club_id', NEW.club_id, 'message_id', NEW.id));
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_message_mentions ON public.club_messages;
CREATE TRIGGER trg_notify_message_mentions
AFTER INSERT ON public.club_messages
FOR EACH ROW
WHEN (NEW.content ~ '@[A-Za-z0-9_\.]{2,30}')
EXECUTE FUNCTION public.notify_message_mentions();

-- ---------- 3. Atualiza club_leaderboard com badge "Citador do mês" ----------
-- Recria a função adicionando: contagem de citações no mês + achievement extra
CREATE OR REPLACE FUNCTION public.club_leaderboard(_club_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  is_owner boolean,
  pages_read integer,
  finished_book boolean,
  messages_count integer,
  reactions_given integer,
  reactions_received integer,
  nominations_count integer,
  votes_received integer,
  total_points integer,
  level integer,
  achievements text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book_id uuid;
  v_top_quoter uuid;
BEGIN
  SELECT current_book_id INTO v_book_id
    FROM public.book_clubs WHERE id = _club_id;

  -- Identifica o top citador do mês corrente (>=3 citações para não premiar zero)
  SELECT m.user_id INTO v_top_quoter
    FROM public.club_messages m
   WHERE m.club_id = _club_id
     AND m.book_quote IS NOT NULL
     AND m.created_at >= date_trunc('month', now())
   GROUP BY m.user_id
  HAVING COUNT(*) >= 3
   ORDER BY COUNT(*) DESC
   LIMIT 1;

  RETURN QUERY
  WITH base AS (
    SELECT cm.user_id,
           (cm.role = 'owner') AS is_owner
      FROM public.club_members cm
     WHERE cm.club_id = _club_id
  ),
  pages AS (
    SELECT b.user_id,
           COALESCE((CASE WHEN ub.status = 'read' THEN COALESCE(bk.page_count, 0)
                          ELSE COALESCE(ub.current_page, 0) END), 0) AS pages_read,
           COALESCE(ub.status = 'read', false) AS finished
      FROM base b
      LEFT JOIN public.user_books ub
             ON ub.user_id = b.user_id AND ub.book_id = v_book_id
      LEFT JOIN public.books bk ON bk.id = ub.book_id
  ),
  msgs AS (
    SELECT m.user_id, COUNT(*)::int AS c
      FROM public.club_messages m
     WHERE m.club_id = _club_id
     GROUP BY m.user_id
  ),
  given AS (
    SELECT r.user_id, COUNT(*)::int AS c
      FROM public.club_message_reactions r
      JOIN public.club_messages m ON m.id = r.message_id
     WHERE m.club_id = _club_id
     GROUP BY r.user_id
  ),
  received AS (
    SELECT m.user_id, COUNT(*)::int AS c
      FROM public.club_message_reactions r
      JOIN public.club_messages m ON m.id = r.message_id
     WHERE m.club_id = _club_id
     GROUP BY m.user_id
  ),
  noms AS (
    SELECT n.nominated_by AS user_id, COUNT(*)::int AS c
      FROM public.club_book_nominations n
     WHERE n.club_id = _club_id
     GROUP BY n.nominated_by
  ),
  votes AS (
    SELECT n.nominated_by AS user_id, COALESCE(SUM(n.votes_count), 0)::int AS c
      FROM public.club_book_nominations n
     WHERE n.club_id = _club_id
     GROUP BY n.nominated_by
  ),
  quotes_month AS (
    SELECT m.user_id, COUNT(*)::int AS c
      FROM public.club_messages m
     WHERE m.club_id = _club_id
       AND m.book_quote IS NOT NULL
       AND m.created_at >= date_trunc('month', now())
     GROUP BY m.user_id
  )
  SELECT
    b.user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    b.is_owner,
    COALESCE(pg.pages_read, 0) AS pages_read,
    COALESCE(pg.finished, false) AS finished_book,
    COALESCE(ms.c, 0) AS messages_count,
    COALESCE(gv.c, 0) AS reactions_given,
    COALESCE(rc.c, 0) AS reactions_received,
    COALESCE(nm.c, 0) AS nominations_count,
    COALESCE(vt.c, 0) AS votes_received,
    (
      COALESCE(pg.pages_read, 0)
      + (CASE WHEN COALESCE(pg.finished, false) THEN 150 ELSE 0 END)
      + COALESCE(ms.c, 0) * 5
      + COALESCE(gv.c, 0) * 2
      + COALESCE(rc.c, 0) * 3
      + COALESCE(nm.c, 0) * 10
      + COALESCE(vt.c, 0) * 5
    )::int AS total_points,
    GREATEST(1, ((
      COALESCE(pg.pages_read, 0)
      + (CASE WHEN COALESCE(pg.finished, false) THEN 150 ELSE 0 END)
      + COALESCE(ms.c, 0) * 5
      + COALESCE(gv.c, 0) * 2
      + COALESCE(rc.c, 0) * 3
      + COALESCE(nm.c, 0) * 10
      + COALESCE(vt.c, 0) * 5
    ) / 500) + 1)::int AS level,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN COALESCE(pg.pages_read, 0) >= 300 THEN 'maratonista' END,
      CASE WHEN COALESCE(pg.finished, false) THEN 'concluinte' END,
      CASE WHEN COALESCE(ms.c, 0) >= 30 THEN 'conversador' END,
      CASE WHEN COALESCE(rc.c, 0) >= 10 THEN 'inspirador' END,
      CASE WHEN COALESCE(vt.c, 0) >= 5 THEN 'curador' END,
      CASE WHEN v_top_quoter IS NOT NULL AND b.user_id = v_top_quoter THEN 'citador_mes' END
    ], NULL) AS achievements
  FROM base b
  LEFT JOIN public.profiles p ON p.id = b.user_id
  LEFT JOIN pages pg ON pg.user_id = b.user_id
  LEFT JOIN msgs ms ON ms.user_id = b.user_id
  LEFT JOIN given gv ON gv.user_id = b.user_id
  LEFT JOIN received rc ON rc.user_id = b.user_id
  LEFT JOIN noms nm ON nm.user_id = b.user_id
  LEFT JOIN votes vt ON vt.user_id = b.user_id
  ORDER BY total_points DESC, messages_count DESC, b.user_id;
END;
$$;
