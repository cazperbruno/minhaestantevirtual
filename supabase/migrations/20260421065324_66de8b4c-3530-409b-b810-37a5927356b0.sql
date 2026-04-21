-- Tabela leve de eventos de produto (telemetria de fluxos, não só por livro).
CREATE TABLE public.app_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event text NOT NULL,
  props jsonb,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_events_event_time ON public.app_events (event, created_at DESC);
CREATE INDEX idx_app_events_user_time ON public.app_events (user_id, created_at DESC) WHERE user_id IS NOT NULL;

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous) can insert their own event. user_id pode ser NULL (anônimo) ou bater com auth.uid().
CREATE POLICY app_events_insert_self
ON public.app_events
FOR INSERT
TO public
WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- Usuário vê seus próprios eventos; admin vê tudo.
CREATE POLICY app_events_select_own
ON public.app_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- Ninguém atualiza/deleta exceto admin
CREATE POLICY app_events_admin_delete
ON public.app_events
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));