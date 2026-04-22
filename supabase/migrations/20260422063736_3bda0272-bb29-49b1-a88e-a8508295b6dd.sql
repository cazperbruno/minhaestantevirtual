CREATE OR REPLACE FUNCTION public.club_book_progress(_club_id uuid)
RETURNS TABLE(
  book_id uuid,
  page_count integer,
  total_members integer,
  reading_count integer,
  finished_count integer,
  avg_progress numeric,
  total_pages_read bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH club AS (
    SELECT bc.current_book_id, b.page_count
    FROM book_clubs bc
    LEFT JOIN books b ON b.id = bc.current_book_id
    WHERE bc.id = _club_id
  ),
  total AS (
    SELECT COUNT(*)::int AS total_members FROM club_members WHERE club_id = _club_id
  ),
  reads AS (
    SELECT ub.user_id, ub.status::text AS status, COALESCE(ub.current_page, 0) AS current_page
    FROM club_members cm
    JOIN club ON true
    LEFT JOIN user_books ub
      ON ub.user_id = cm.user_id
     AND ub.book_id = club.current_book_id
    WHERE cm.club_id = _club_id
      AND club.current_book_id IS NOT NULL
  )
  SELECT
    (SELECT current_book_id FROM club),
    (SELECT page_count FROM club),
    (SELECT total_members FROM total),
    COALESCE(SUM(CASE WHEN status = 'reading' THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END), 0)::int,
    CASE
      WHEN (SELECT page_count FROM club) IS NULL OR (SELECT page_count FROM club) = 0
        THEN NULL
      ELSE ROUND(AVG(
        LEAST(
          100.0,
          CASE
            WHEN status = 'read' THEN 100.0
            ELSE (current_page::numeric / NULLIF((SELECT page_count FROM club), 0)) * 100.0
          END
        )
      )::numeric, 1)
    END,
    COALESCE(SUM(
      CASE
        WHEN status = 'read' THEN COALESCE((SELECT page_count FROM club), 0)
        ELSE current_page
      END
    ), 0)::bigint
  FROM reads;
$$;

REVOKE ALL ON FUNCTION public.club_book_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_book_progress(uuid) TO authenticated;