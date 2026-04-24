
-- Policy genérica de INSERT em notifications para tipos de sistema:
-- Triggers SECURITY DEFINER rodam com auth.uid() do invocador, então
-- a checagem WITH CHECK precisa ser baseada no kind (whitelist), não em user_id.
CREATE POLICY "notifications_insert_system_kinds"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  kind IN (
    'trade_match',
    'trade_proposed',
    'trade_accepted',
    'trade_declined',
    'trade_completed',
    'achievement_unlocked',
    'new_follower',
    'mention',
    'comment',
    'like',
    'series_progress',
    'club_message',
    'club_book_set',
    'streak_risk',
    'league_finale',
    'recommendation_received',
    'buddy_invite',
    'buddy_message'
  )
);
