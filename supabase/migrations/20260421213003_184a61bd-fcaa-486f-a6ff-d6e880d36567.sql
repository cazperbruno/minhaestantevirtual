-- 1) Notifications: hardening para convites de clube
-- Agora exige que o user_id (destinatário) seja realmente um convidado/membro do clube
DROP POLICY IF EXISTS notifications_insert_club_invite ON public.notifications;
CREATE POLICY notifications_insert_club_invite
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  kind = 'club_invitation'
  AND meta ? 'club_id'
  AND is_club_member((meta ->> 'club_id')::uuid, auth.uid())
  AND (
    -- Destinatário é convidado pendente OU já é membro do clube
    EXISTS (
      SELECT 1 FROM public.club_invitations ci
      WHERE ci.club_id = (meta ->> 'club_id')::uuid
        AND ci.invitee_id = notifications.user_id
        AND ci.status = 'pending'
    )
    OR is_club_member((meta ->> 'club_id')::uuid, notifications.user_id)
  )
);

-- 2) Buddy read participants: política DELETE faltante
-- Permite que o próprio participante saia, ou que o iniciador remova alguém
CREATE POLICY brp_delete_self_or_initiator
ON public.buddy_read_participants
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.buddy_reads br
    WHERE br.id = buddy_read_participants.buddy_read_id
      AND br.initiator_id = auth.uid()
  )
);
