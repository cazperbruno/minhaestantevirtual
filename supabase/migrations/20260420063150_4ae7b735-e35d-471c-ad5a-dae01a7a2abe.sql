CREATE OR REPLACE FUNCTION public.recompute_challenge_progress(_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ch record; new_progress int; updated_count int := 0;
BEGIN
  FOR ch IN
    SELECT uc.*, ct.metric
    FROM public.user_challenges uc
    JOIN public.challenge_templates ct ON ct.code = uc.template_code
    WHERE uc.user_id = _user_id AND uc.status = 'active' AND uc.expires_at > now()
  LOOP
    new_progress := CASE ch.metric
      WHEN 'add_book' THEN (
        SELECT COUNT(*)::int FROM public.user_books
        WHERE user_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'finish_book' THEN (
        SELECT COUNT(*)::int FROM public.user_books
        WHERE user_id = _user_id AND status = 'read' AND finished_at >= ch.created_at
      )
      WHEN 'rate_book' THEN (
        SELECT COUNT(*)::int FROM public.user_books
        WHERE user_id = _user_id AND rating IS NOT NULL AND updated_at >= ch.created_at
      )
      WHEN 'scan_book' THEN (
        SELECT COUNT(*)::int FROM public.user_interactions
        WHERE user_id = _user_id AND kind = 'scan' AND created_at >= ch.created_at
      )
      WHEN 'like_review' THEN (
        SELECT COUNT(*)::int FROM public.review_likes
        WHERE user_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'comment_review' THEN (
        SELECT COUNT(*)::int FROM public.review_comments
        WHERE user_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'write_review' THEN (
        SELECT COUNT(*)::int FROM public.reviews
        WHERE user_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'follow' THEN (
        SELECT COUNT(*)::int FROM public.follows
        WHERE follower_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'club_message' THEN (
        SELECT COUNT(*)::int FROM public.club_messages
        WHERE user_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'loan_book' THEN (
        SELECT COUNT(*)::int FROM public.loans
        WHERE user_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'manga_volumes_today' THEN (
        SELECT COUNT(*)::int
        FROM public.user_books ub
        JOIN public.books b ON b.id = ub.book_id
        WHERE ub.user_id = _user_id
          AND b.content_type = 'manga'
          AND ub.status IN ('reading', 'read')
          AND ub.updated_at >= GREATEST(ch.created_at, date_trunc('day', now()))
      )
      WHEN 'comic_issues_week' THEN (
        SELECT COUNT(*)::int
        FROM public.user_books ub
        JOIN public.books b ON b.id = ub.book_id
        WHERE ub.user_id = _user_id
          AND b.content_type = 'comic'
          AND ub.status IN ('reading', 'read')
          AND ub.updated_at >= GREATEST(ch.created_at, now() - interval '7 days')
      )
      WHEN 'magazine_today' THEN (
        SELECT COUNT(*)::int
        FROM public.user_books ub
        JOIN public.books b ON b.id = ub.book_id
        WHERE ub.user_id = _user_id
          AND b.content_type = 'magazine'
          AND ub.status IN ('reading', 'read')
          AND ub.updated_at >= GREATEST(ch.created_at, date_trunc('day', now()))
      )
      WHEN 'open_app' THEN ch.progress  -- atualizado externamente
      ELSE ch.progress
    END;

    IF new_progress <> ch.progress OR (new_progress >= ch.target AND ch.status = 'active') THEN
      UPDATE public.user_challenges
        SET progress = LEAST(new_progress, ch.target),
            status = CASE WHEN new_progress >= ch.target THEN 'completed' ELSE 'active' END,
            completed_at = CASE WHEN new_progress >= ch.target AND completed_at IS NULL THEN now() ELSE completed_at END
        WHERE id = ch.id;
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  -- Expirar antigos
  UPDATE public.user_challenges
    SET status = 'expired'
    WHERE user_id = _user_id AND status = 'active' AND expires_at <= now();

  RETURN updated_count;
END $function$;