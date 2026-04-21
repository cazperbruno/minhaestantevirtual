-- Prevent users from self-approving their own club join requests.
-- Only the club owner may UPDATE join request rows (typically to change status).
-- The requesting user can still DELETE (withdraw) their own request via the existing delete policy.

DROP POLICY IF EXISTS join_requests_update_owner_or_self ON public.club_join_requests;

CREATE POLICY join_requests_update_owner_only
ON public.club_join_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.book_clubs bc
    WHERE bc.id = club_join_requests.club_id
      AND bc.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.book_clubs bc
    WHERE bc.id = club_join_requests.club_id
      AND bc.owner_id = auth.uid()
  )
);