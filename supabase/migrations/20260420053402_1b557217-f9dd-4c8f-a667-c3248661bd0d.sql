-- Endurecer autorização: usar regex ancorado em vez de LIKE
DROP POLICY IF EXISTS "messages_select_authorized" ON realtime.messages;
DROP POLICY IF EXISTS "messages_insert_authorized" ON realtime.messages;

-- Helper: extrai o UUID de um tópico no formato "<prefix>:<uuid>"
-- Padrões aceitos:
--   user:<uuid>
--   rt:user:<uuid>
--   club:<uuid>
--   rt:club:<uuid>

CREATE POLICY "messages_select_authorized"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- tópico pessoal exato
  realtime.topic() = 'user:' || auth.uid()::text
  OR realtime.topic() = 'rt:user:' || auth.uid()::text
  -- tópico de clube do qual o usuário é membro
  OR EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND (
        realtime.topic() = 'club:' || cm.club_id::text
        OR realtime.topic() = 'rt:club:' || cm.club_id::text
      )
  )
);

CREATE POLICY "messages_insert_authorized"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() = 'user:' || auth.uid()::text
  OR realtime.topic() = 'rt:user:' || auth.uid()::text
  OR EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND (
        realtime.topic() = 'club:' || cm.club_id::text
        OR realtime.topic() = 'rt:club:' || cm.club_id::text
      )
  )
);