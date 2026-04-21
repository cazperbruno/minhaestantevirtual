-- 1) Streak freeze: novos campos
ALTER TABLE public.user_streaks
  ADD COLUMN IF NOT EXISTS freezes_available integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_freeze_grant date,
  ADD COLUMN IF NOT EXISTS last_freeze_used_date date;

-- 2) RPC: livros lidos por quem você segue
CREATE OR REPLACE FUNCTION public.books_read_by_following(
  _user_id uuid,
  _limit integer DEFAULT 20
)
RETURNS TABLE(
  book_id uuid,
  reader_count integer,
  recent_at timestamptz,
  reader_avatars text[],
  reader_names text[]
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH followed AS (
    SELECT following_id FROM public.follows WHERE follower_id = _user_id
  ),
  my_books AS (
    SELECT book_id FROM public.user_books WHERE user_id = _user_id
  ),
  read_by_them AS (
    SELECT
      ub.book_id,
      ub.user_id,
      ub.finished_at,
      ub.updated_at,
      p.avatar_url,
      COALESCE(p.display_name, p.username, 'Leitor') AS reader_name
    FROM public.user_books ub
    JOIN followed f ON f.following_id = ub.user_id
    JOIN public.profiles p ON p.id = ub.user_id
    WHERE ub.status = 'read'
      AND ub.is_public = true
      AND ub.book_id NOT IN (SELECT book_id FROM my_books)
  )
  SELECT
    rbt.book_id,
    COUNT(DISTINCT rbt.user_id)::int AS reader_count,
    MAX(COALESCE(rbt.finished_at, rbt.updated_at)) AS recent_at,
    (ARRAY_AGG(rbt.avatar_url ORDER BY COALESCE(rbt.finished_at, rbt.updated_at) DESC))[1:5] AS reader_avatars,
    (ARRAY_AGG(rbt.reader_name ORDER BY COALESCE(rbt.finished_at, rbt.updated_at) DESC))[1:5] AS reader_names
  FROM read_by_them rbt
  GROUP BY rbt.book_id
  ORDER BY MAX(COALESCE(rbt.finished_at, rbt.updated_at)) DESC NULLS LAST,
           COUNT(DISTINCT rbt.user_id) DESC
  LIMIT _limit;
$$;

-- 3) RPC: usar streak freeze (renova 1 por semana automaticamente)
CREATE OR REPLACE FUNCTION public.use_streak_freeze(_user_id uuid)
RETURNS TABLE(success boolean, message text, freezes_left integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  today date := CURRENT_DATE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RETURN QUERY SELECT false, 'forbidden'::text, 0; RETURN;
  END IF;

  SELECT * INTO s FROM public.user_streaks WHERE user_id = _user_id;
  IF s IS NULL THEN
    INSERT INTO public.user_streaks (user_id, freezes_available, last_freeze_grant)
    VALUES (_user_id, 1, today);
    RETURN QUERY SELECT false, 'no_streak'::text, 1; RETURN;
  END IF;

  -- Renovar 1 freeze por semana
  IF s.last_freeze_grant IS NULL OR (today - s.last_freeze_grant) >= 7 THEN
    UPDATE public.user_streaks
      SET freezes_available = LEAST(3, COALESCE(freezes_available,0) + 1),
          last_freeze_grant = today
      WHERE user_id = _user_id
      RETURNING freezes_available INTO s.freezes_available;
  END IF;

  IF s.freezes_available <= 0 THEN
    RETURN QUERY SELECT false, 'no_freezes'::text, 0; RETURN;
  END IF;

  -- Aplicar freeze: avança last_active_date pra ontem (mantém streak vivo)
  UPDATE public.user_streaks
    SET freezes_available = freezes_available - 1,
        last_freeze_used_date = today,
        last_active_date = today - 1,
        updated_at = now()
    WHERE user_id = _user_id;

  RETURN QUERY SELECT true, 'ok'::text, (s.freezes_available - 1);
END $$;