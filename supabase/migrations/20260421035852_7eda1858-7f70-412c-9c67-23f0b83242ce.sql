-- Function: pick books to audit (priority: no cover > most viewed > stale)
CREATE OR REPLACE FUNCTION public.books_for_cover_audit(_limit int DEFAULT 25)
RETURNS TABLE(book_id uuid, priority real)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH activity AS (
    SELECT ui.book_id, COUNT(*)::real AS hits
    FROM public.user_interactions ui
    WHERE ui.created_at > now() - interval '30 days'
    GROUP BY ui.book_id
  )
  SELECT b.id AS book_id,
    (CASE WHEN b.cover_url IS NULL THEN 1000.0 ELSE 0.0 END
     + COALESCE(a.hits, 0)
     - EXTRACT(EPOCH FROM (now() - b.updated_at)) / 86400.0 * 0.1)::real AS priority
  FROM public.books b
  LEFT JOIN activity a ON a.book_id = b.id
  ORDER BY priority DESC NULLS LAST
  LIMIT _limit;
$$;

-- Audit log table (admin-only)
CREATE TABLE IF NOT EXISTS public.cover_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL,
  checked int NOT NULL DEFAULT 0,
  ok int NOT NULL DEFAULT 0,
  replaced int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  details jsonb
);

ALTER TABLE public.cover_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cover_audit_select_admin" ON public.cover_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS cover_audit_log_ran_at_idx
  ON public.cover_audit_log (ran_at DESC);