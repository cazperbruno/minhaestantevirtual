-- Habilitar RLS em realtime.messages e restringir broadcasts
-- Política: o usuário só pode ler/enviar broadcasts em tópicos que comecem com seu próprio user_id
-- ou em tópicos de clubes dos quais é membro (formato: "club:<uuid>" ou "user:<uuid>")

ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

-- Limpar políticas antigas (se houver) para evitar duplicatas
DROP POLICY IF EXISTS "messages_select_authorized" ON realtime.messages;
DROP POLICY IF EXISTS "messages_insert_authorized" ON realtime.messages;

-- SELECT: usuário pode receber broadcasts em tópicos próprios ou de clubes dos quais é membro
CREATE POLICY "messages_select_authorized"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- tópico pessoal: "user:<auth.uid()>" ou "rt:user:<auth.uid()>"
  realtime.topic() LIKE '%' || auth.uid()::text || '%'
  -- ou tópico de clube do qual o usuário é membro: "club:<club_id>"
  OR EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE realtime.topic() LIKE '%' || cm.club_id::text || '%'
      AND cm.user_id = auth.uid()
  )
);

-- INSERT (broadcast.send): mesma regra
CREATE POLICY "messages_insert_authorized"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE '%' || auth.uid()::text || '%'
  OR EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE realtime.topic() LIKE '%' || cm.club_id::text || '%'
      AND cm.user_id = auth.uid()
  )
);