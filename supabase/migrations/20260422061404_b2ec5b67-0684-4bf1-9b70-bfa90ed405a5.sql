-- 1. Clube em destaque (mais ativo nos últimos 7 dias)
CREATE OR REPLACE FUNCTION public.featured_club()
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  category public.club_category,
  current_book_id uuid,
  member_count bigint,
  online_count bigint,
  activity_score bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH msg_stats AS (
    SELECT club_id, COUNT(*) AS msg_count
    FROM public.club_messages
    WHERE created_at > now() - interval '7 days'
    GROUP BY club_id
  ),
  member_stats AS (
    SELECT
      club_id,
      COUNT(*) AS total_members,
      COUNT(*) FILTER (WHERE last_seen_at > now() - interval '5 minutes') AS online_now,
      COUNT(*) FILTER (WHERE joined_at > now() - interval '7 days') AS new_members
    FROM public.club_members
    GROUP BY club_id
  )
  SELECT
    bc.id,
    bc.name,
    bc.description,
    bc.category,
    bc.current_book_id,
    COALESCE(ms.total_members, 0) AS member_count,
    COALESCE(ms.online_now, 0) AS online_count,
    (COALESCE(msg.msg_count, 0) * 2 + COALESCE(ms.new_members, 0) * 5 + COALESCE(ms.online_now, 0) * 3)::bigint AS activity_score
  FROM public.book_clubs bc
  LEFT JOIN msg_stats msg ON msg.club_id = bc.id
  LEFT JOIN member_stats ms ON ms.club_id = bc.id
  WHERE bc.is_public = true
    AND COALESCE(ms.total_members, 0) > 0
  ORDER BY activity_score DESC NULLS LAST, bc.updated_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.featured_club() FROM public;
GRANT EXECUTE ON FUNCTION public.featured_club() TO authenticated;

-- 2. Clubes recomendados (categorias dos meus clubes; senão, mais ativos)
CREATE OR REPLACE FUNCTION public.recommended_clubs(_limit int DEFAULT 6)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  category public.club_category,
  current_book_id uuid,
  member_count bigint,
  online_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_clubs AS (
    SELECT club_id FROM public.club_members WHERE user_id = auth.uid()
  ),
  my_categories AS (
    SELECT DISTINCT bc.category
    FROM public.book_clubs bc
    JOIN my_clubs mc ON mc.club_id = bc.id
  ),
  member_stats AS (
    SELECT
      club_id,
      COUNT(*) AS total_members,
      COUNT(*) FILTER (WHERE last_seen_at > now() - interval '5 minutes') AS online_now
    FROM public.club_members
    GROUP BY club_id
  ),
  msg_stats AS (
    SELECT club_id, COUNT(*) AS recent_msgs
    FROM public.club_messages
    WHERE created_at > now() - interval '14 days'
    GROUP BY club_id
  )
  SELECT
    bc.id,
    bc.name,
    bc.description,
    bc.category,
    bc.current_book_id,
    COALESCE(ms.total_members, 0) AS member_count,
    COALESCE(ms.online_now, 0) AS online_count
  FROM public.book_clubs bc
  LEFT JOIN member_stats ms ON ms.club_id = bc.id
  LEFT JOIN msg_stats msg ON msg.club_id = bc.id
  WHERE bc.is_public = true
    AND bc.id NOT IN (SELECT club_id FROM my_clubs)
  ORDER BY
    -- prioriza categorias que o usuário já curte
    (CASE WHEN bc.category IN (SELECT category FROM my_categories) THEN 0 ELSE 1 END),
    COALESCE(ms.online_now, 0) DESC,
    COALESCE(msg.recent_msgs, 0) DESC,
    COALESCE(ms.total_members, 0) DESC,
    bc.updated_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 24));
$$;

REVOKE ALL ON FUNCTION public.recommended_clubs(int) FROM public;
GRANT EXECUTE ON FUNCTION public.recommended_clubs(int) TO authenticated;

-- 3. Atividade recente do clube — só membros
CREATE OR REPLACE FUNCTION public.club_recent_activity(_club_id uuid, _limit int DEFAULT 8)
RETURNS TABLE(
  kind text,
  at timestamptz,
  user_id uuid,
  payload jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_club_member(_club_id, auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  (
    SELECT 'message'::text, cm.created_at, cm.user_id,
      jsonb_build_object('preview', LEFT(cm.content, 120)) AS payload
    FROM public.club_messages cm
    WHERE cm.club_id = _club_id
    ORDER BY cm.created_at DESC
    LIMIT _limit
  )
  UNION ALL
  (
    SELECT 'joined'::text, cm.joined_at, cm.user_id, '{}'::jsonb
    FROM public.club_members cm
    WHERE cm.club_id = _club_id
    ORDER BY cm.joined_at DESC
    LIMIT _limit
  )
  ORDER BY at DESC
  LIMIT _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.club_recent_activity(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.club_recent_activity(uuid, int) TO authenticated;