-- Remove client-side INSERT/UPDATE on user_challenges to prevent XP manipulation.
-- All challenge creation must go through assign_daily_challenges() (SECURITY DEFINER).
-- All progress/claim updates must go through recompute_challenge_progress() and claim_challenge() (SECURITY DEFINER).

DROP POLICY IF EXISTS uc_insert_own ON public.user_challenges;
DROP POLICY IF EXISTS uc_update_own ON public.user_challenges;

-- Keep DELETE so users can dismiss/abandon a challenge if they want
-- Keep SELECT so users can read their own challenges
-- No INSERT and no UPDATE policies = blocked for normal users; SECURITY DEFINER functions still work.