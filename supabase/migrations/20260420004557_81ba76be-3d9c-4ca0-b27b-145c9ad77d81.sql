
DROP VIEW IF EXISTS public.trending_books;
CREATE VIEW public.trending_books
WITH (security_invoker = true) AS
SELECT
  b.id,
  COUNT(DISTINCT ub.user_id)::int AS readers,
  COUNT(DISTINCT i.user_id)::int AS recent_interactions,
  (COUNT(DISTINCT ub.user_id) * 3 + COUNT(DISTINCT i.user_id))::int AS score
FROM public.books b
LEFT JOIN public.user_books ub ON ub.book_id = b.id AND ub.created_at > now() - interval '30 days'
LEFT JOIN public.user_interactions i ON i.book_id = b.id AND i.created_at > now() - interval '7 days'
GROUP BY b.id
HAVING COUNT(DISTINCT ub.user_id) > 0 OR COUNT(DISTINCT i.user_id) > 0;

CREATE OR REPLACE FUNCTION public.array_intersect_count(a text[], b text[])
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COUNT(*)::int FROM (
    SELECT unnest(COALESCE(a, ARRAY[]::text[]))
    INTERSECT
    SELECT unnest(COALESCE(b, ARRAY[]::text[]))
  ) AS shared;
$$;
