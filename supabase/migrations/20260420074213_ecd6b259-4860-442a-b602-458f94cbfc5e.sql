-- Tabela de push subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subs_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs_select_own" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "push_subs_insert_own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subs_update_own" ON public.push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "push_subs_delete_own" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER push_subs_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: ao inserir notification, dispara edge function send-push via pg_net
CREATE OR REPLACE FUNCTION public.notify_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_anon text;
BEGIN
  -- Configurações vão por GUC; se ausentes, simplesmente não envia (notificação in-app continua funcionando)
  BEGIN
    v_url := current_setting('app.supabase_url', true);
    v_anon := current_setting('app.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF v_url IS NULL OR v_anon IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'link', NEW.link
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

-- Habilita pg_net se ainda não está
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TRIGGER notifications_push_trigger
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_notification();