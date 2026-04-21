-- View agregada para o painel admin: contagens diárias por evento + sessões únicas + p50/p95 latência.
CREATE OR REPLACE VIEW public.app_events_daily
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', created_at) AS day,
  event,
  count(*)::bigint AS total,
  count(DISTINCT session_id)::bigint AS sessions,
  count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::bigint AS users,
  percentile_disc(0.5) WITHIN GROUP (ORDER BY (props->>'latency_ms')::numeric)
    FILTER (WHERE props ? 'latency_ms')::numeric AS p50_latency_ms,
  percentile_disc(0.95) WITHIN GROUP (ORDER BY (props->>'latency_ms')::numeric)
    FILTER (WHERE props ? 'latency_ms')::numeric AS p95_latency_ms
FROM public.app_events
WHERE created_at > now() - interval '60 days'
GROUP BY 1, 2;

-- security_invoker garante que a RLS de app_events (admin/own) seja aplicada via view.
COMMENT ON VIEW public.app_events_daily IS
  'Agregação diária dos últimos 60 dias para painel admin. Respeita RLS de app_events.';