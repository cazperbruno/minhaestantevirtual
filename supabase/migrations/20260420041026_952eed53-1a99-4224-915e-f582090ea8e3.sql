-- Recria as duas views novas com security_invoker=true para respeitar RLS do usuário consultante
DROP VIEW IF EXISTS public.ambassadors_view;
CREATE VIEW public.ambassadors_view
WITH (security_invoker = true) AS
SELECT
  i.user_id AS id,
  p.display_name,
  p.username,
  p.avatar_url,
  i.signups_count,
  i.xp_earned,
  CASE
    WHEN i.signups_count >= 100 THEN 'Lenda da Leitura'
    WHEN i.signups_count >= 25  THEN 'Embaixador Readify'
    WHEN i.signups_count >= 10  THEN 'Influenciador Literário'
    WHEN i.signups_count >= 3   THEN 'Conector'
    WHEN i.signups_count >= 1   THEN 'Iniciante Social'
    ELSE 'Sem convites ainda'
  END AS tier,
  ROW_NUMBER() OVER (ORDER BY i.signups_count DESC, i.xp_earned DESC) AS position
FROM public.invites i
JOIN public.profiles p ON p.id = i.user_id
WHERE i.signups_count > 0;

DROP VIEW IF EXISTS public.weekly_ranking_view;
CREATE VIEW public.weekly_ranking_view
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.display_name,
  p.username,
  p.avatar_url,
  p.level,
  COALESCE(SUM(e.amount), 0)::int AS weekly_xp,
  ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(e.amount), 0) DESC) AS position
FROM public.profiles p
LEFT JOIN public.xp_events e
  ON e.user_id = p.id AND e.created_at >= now() - interval '7 days'
GROUP BY p.id, p.display_name, p.username, p.avatar_url, p.level
HAVING COALESCE(SUM(e.amount), 0) > 0;