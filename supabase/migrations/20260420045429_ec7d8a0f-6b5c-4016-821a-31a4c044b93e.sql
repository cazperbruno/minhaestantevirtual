
-- ============================================================
-- SECURITY HARDENING MIGRATION
-- ============================================================

-- 1) PRIVILEGE_ESCALATION_XP_EVENTS / PUBLIC_DATA_EXPOSURE
-- Remove direct INSERT on xp_events. Only add_xp() (SECURITY DEFINER) may insert.
DROP POLICY IF EXISTS "xp_events_insert_own" ON public.xp_events;

-- Defense in depth: cap individual XP events to a sane range
ALTER TABLE public.xp_events
  DROP CONSTRAINT IF EXISTS xp_events_amount_sane;
ALTER TABLE public.xp_events
  ADD CONSTRAINT xp_events_amount_sane
  CHECK (amount >= -5000 AND amount <= 5000);

-- 2) PRIVILEGE_ESCALATION_USER_ACHIEVEMENTS
-- Remove direct self-insert; achievements unlocked exclusively via check_achievements() (SECURITY DEFINER).
DROP POLICY IF EXISTS "ua_insert_own" ON public.user_achievements;

-- 3) NOTIFICATIONS_SELF_INSERT
-- Remove direct insert. Notifications come from triggers / SECURITY DEFINER functions only.
-- We still allow the system to write via SECURITY DEFINER functions and triggers (which bypass RLS).
-- Add explicit policy for the club-invitation flow used in src/hooks/useClubAccess.ts:
DROP POLICY IF EXISTS "notifications_insert_self" ON public.notifications;

-- Allow inserting notifications targeted at OTHER users only when the actor is acting
-- inside a legitimate flow (e.g., club admin inviting a member). We restrict to club invitations
-- where the actor is a member of the club referenced.
CREATE POLICY "notifications_insert_club_invite"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    kind = 'club_invitation'
    AND meta ? 'club_id'
    AND public.is_club_member((meta->>'club_id')::uuid, auth.uid())
  );

-- 4) BOOKS_UNRESTRICTED_UPDATE
-- Tighten books update: only authenticated users may update, and only specific safe fields
-- (cover_url, description, categories) when the row was originally sourced from an external
-- catalog. We replace the broad policy with a narrower one. Since there is no created_by
-- column, we restrict updates to admins via the existing app_role.
DROP POLICY IF EXISTS "books_update_authenticated" ON public.books;

CREATE POLICY "books_update_admin"
  ON public.books
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND length(title) > 0);

-- 5) EXPOSED_INVITE_CODES
-- Restrict invites SELECT to the owning user. Redemption (lookup by code) goes through
-- redeem_invite() which is SECURITY DEFINER and already validates the code server-side.
DROP POLICY IF EXISTS "invites_select_all" ON public.invites;

CREATE POLICY "invites_select_own"
  ON public.invites
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- The ambassadors_view aggregates invites publicly for the leaderboard.
-- Recreate it as SECURITY DEFINER-equivalent (security_invoker=false default keeps it usable),
-- but we ensure it only exposes aggregate, non-sensitive columns (no raw `code`).
-- (View already excludes `code` — verified in current schema. Keeping as-is.)
