-- Wave 3: reactions, threads e quotes nas mensagens do clube

-- 1) Adiciona colunas de thread e quote na própria club_messages
ALTER TABLE public.club_messages
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.club_messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS book_quote jsonb;

CREATE INDEX IF NOT EXISTS club_messages_parent_idx
  ON public.club_messages(parent_id)
  WHERE parent_id IS NOT NULL;

-- 2) Tabela de reactions (1 reação por usuário/mensagem/emoji)
CREATE TABLE IF NOT EXISTS public.club_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.club_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL CHECK (length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS club_message_reactions_msg_idx
  ON public.club_message_reactions(message_id);

ALTER TABLE public.club_message_reactions ENABLE ROW LEVEL SECURITY;

-- Helper: usuário pode ver/reagir se for membro do clube da mensagem
CREATE OR REPLACE FUNCTION public.can_react_to_message(_message_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_messages cm
    WHERE cm.id = _message_id
      AND public.is_club_member(cm.club_id, _user_id)
  );
$$;

-- Policies
DROP POLICY IF EXISTS reactions_select_member ON public.club_message_reactions;
CREATE POLICY reactions_select_member ON public.club_message_reactions FOR SELECT
  USING (public.can_react_to_message(message_id, auth.uid()));

DROP POLICY IF EXISTS reactions_insert_self ON public.club_message_reactions;
CREATE POLICY reactions_insert_self ON public.club_message_reactions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_react_to_message(message_id, auth.uid())
  );

DROP POLICY IF EXISTS reactions_delete_own ON public.club_message_reactions;
CREATE POLICY reactions_delete_own ON public.club_message_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- Realtime
ALTER TABLE public.club_message_reactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.club_message_reactions;