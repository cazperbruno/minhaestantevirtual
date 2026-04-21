-- Restringir INSERT em app_events: apenas usuários autenticados, com user_id = auth.uid()
DROP POLICY IF EXISTS app_events_insert_self ON public.app_events;

CREATE POLICY app_events_insert_self
ON public.app_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);