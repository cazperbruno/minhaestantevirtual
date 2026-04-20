-- 1) club_members: exigir convite aceito ou pedido aprovado para entrar em clube público
DROP POLICY IF EXISTS members_insert_self ON public.club_members;
CREATE POLICY members_insert_self
ON public.club_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    -- dono do clube (auto-membership via trigger add_owner_as_member)
    EXISTS (SELECT 1 FROM public.book_clubs bc WHERE bc.id = club_members.club_id AND bc.owner_id = auth.uid())
    -- convite aceito
    OR EXISTS (
      SELECT 1 FROM public.club_invitations ci
      WHERE ci.club_id = club_members.club_id
        AND ci.invitee_id = auth.uid()
        AND ci.status = 'accepted'
    )
    -- pedido aprovado
    OR EXISTS (
      SELECT 1 FROM public.club_join_requests jr
      WHERE jr.club_id = club_members.club_id
        AND jr.user_id = auth.uid()
        AND jr.status = 'approved'
    )
  )
);

-- 2) recommendation_likes: visibilidade espelha a da recomendação
DROP POLICY IF EXISTS rec_likes_select_all ON public.recommendation_likes;
CREATE POLICY rec_likes_select_visible
ON public.recommendation_likes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.book_recommendations r
    WHERE r.id = recommendation_likes.recommendation_id
      AND (
        r.is_public = true
        OR r.user_id = auth.uid()
        OR public.is_rec_recipient(r.id, auth.uid())
      )
  )
);