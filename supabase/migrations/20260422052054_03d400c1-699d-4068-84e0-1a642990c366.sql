-- ===========================================================
-- Fase 1 — Retenção: streak-at-risk notifier + helpers de feed social
-- ===========================================================

-- 1) Função: identifica usuários cujo streak está "em risco hoje"
--    (têm current_days >= 1, last_active_date < hoje em America/Sao_Paulo,
--     e ainda não receberam um aviso hoje)
CREATE OR REPLACE FUNCTION public.streak_at_risk_today()
RETURNS TABLE(user_id uuid, current_days int, freezes_available int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, s.current_days, s.freezes_available
  FROM public.user_streaks s
  WHERE s.current_days >= 1
    AND COALESCE(s.last_active_date, '1970-01-01'::date)
        < (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = s.user_id
        AND n.kind = 'streak_at_risk'
        AND n.created_at::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    );
$$;

-- 2) Função pra inserir o batch de notificações (evita exigir SERVICE_ROLE
--    na edge function só pra criar avisos)
CREATE OR REPLACE FUNCTION public.create_streak_risk_notifications()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count int := 0;
BEGIN
  WITH ins AS (
    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    SELECT
      r.user_id,
      'streak_at_risk',
      '🔥 Seu streak está em risco!',
      CASE
        WHEN r.freezes_available > 0
          THEN 'Você está há ' || r.current_days || ' dia' ||
               CASE WHEN r.current_days > 1 THEN 's' ELSE '' END ||
               ' lendo. Leia 1 página hoje ou use 1 freeze pra proteger.'
        ELSE 'Você está há ' || r.current_days || ' dia' ||
             CASE WHEN r.current_days > 1 THEN 's' ELSE '' END ||
             ' lendo. Não perca a sequência — leia 1 página hoje!'
      END,
      '/library',
      jsonb_build_object(
        'current_days', r.current_days,
        'freezes_available', r.freezes_available
      )
    FROM public.streak_at_risk_today() r
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted_count FROM ins;
  RETURN inserted_count;
END;
$$;

-- 3) Função pra detectar "streak em risco hoje" no front (1 chamada barata)
CREATE OR REPLACE FUNCTION public.my_streak_at_risk()
RETURNS TABLE(at_risk boolean, current_days int, freezes_available int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (s.current_days >= 1
      AND COALESCE(s.last_active_date, '1970-01-01'::date)
          < (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS at_risk,
    s.current_days,
    s.freezes_available
  FROM public.user_streaks s
  WHERE s.user_id = auth.uid();
$$;

-- 4) Função: livros que pessoas que sigo estão lendo AGORA (últimos 7 dias)
CREATE OR REPLACE FUNCTION public.friends_reading_now(_user_id uuid, _limit int DEFAULT 14)
RETURNS TABLE(book_id uuid, friends_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ub.book_id, COUNT(DISTINCT ub.user_id)::int AS friends_count
  FROM public.user_books ub
  JOIN public.follows f ON f.following_id = ub.user_id
  WHERE f.follower_id = _user_id
    AND ub.status = 'reading'
    AND ub.updated_at > now() - interval '14 days'
  GROUP BY ub.book_id
  ORDER BY friends_count DESC, MAX(ub.updated_at) DESC
  LIMIT _limit;
$$;

-- 5) Função: livros em alta entre quem eu sigo (últimas 2 semanas)
CREATE OR REPLACE FUNCTION public.trending_in_circle(_user_id uuid, _limit int DEFAULT 14)
RETURNS TABLE(book_id uuid, score numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH circle AS (
    SELECT following_id AS uid FROM public.follows WHERE follower_id = _user_id
    UNION SELECT _user_id
  )
  SELECT
    a.book_id,
    (SUM(CASE a.kind
            WHEN 'finished_reading' THEN 3
            WHEN 'book_rated' THEN 2
            WHEN 'book_added' THEN 1
            ELSE 0.5
         END))::numeric AS score
  FROM public.activities a
  JOIN circle c ON c.uid = a.user_id
  WHERE a.book_id IS NOT NULL
    AND a.created_at > now() - interval '14 days'
    AND a.kind IN ('finished_reading','book_rated','book_added','book_started')
  GROUP BY a.book_id
  ORDER BY score DESC
  LIMIT _limit;
$$;

-- 6) Permissões pras funções
GRANT EXECUTE ON FUNCTION public.my_streak_at_risk() TO authenticated;
GRANT EXECUTE ON FUNCTION public.friends_reading_now(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trending_in_circle(uuid, int) TO authenticated;
-- streak_at_risk_today / create_streak_risk_notifications: só service_role (cron)
REVOKE ALL ON FUNCTION public.streak_at_risk_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_streak_risk_notifications() FROM PUBLIC, anon, authenticated;

-- 7) Cron diário 20:00 (Brasília = 23:00 UTC) chamando a edge function
SELECT cron.unschedule('notify-streak-risk-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-streak-risk-daily');

SELECT cron.schedule(
  'notify-streak-risk-daily',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gjlzkviwzqxyiwaajoly.supabase.co/functions/v1/notify-streak-risk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);