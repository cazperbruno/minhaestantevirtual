
DROP VIEW IF EXISTS public.book_quality_trend;
CREATE VIEW public.book_quality_trend
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', updated_at)::date AS day,
  count(*) AS books_touched,
  round(avg(quality_score)::numeric, 1) AS avg_score,
  count(*) FILTER (WHERE quality_score < 50) AS poor_count
FROM public.books
GROUP BY 1
ORDER BY 1 DESC;
