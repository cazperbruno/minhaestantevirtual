-- READIFY PROFILE COLUMN PRIVACY
--
-- `profiles` historically allowed SELECT * to anon/authenticated. That made
-- private preferences and social/contact fields queryable even when the UI
-- presented the profile as restricted. Keep only the minimum community
-- identity publicly readable and expose the full row to its owner through a
-- self-scoped SECURITY DEFINER RPC.

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_jsonb(p)
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;

-- Remove table-wide read grants. RLS still determines which rows are eligible,
-- while PostgreSQL column privileges determine which fields the client can see.
REVOKE SELECT ON TABLE public.profiles FROM anon, authenticated;

-- Minimal identity required by feed, comments, clubs, rankings and reader search.
-- Do NOT add bio, social links, privacy flags, onboarding/tutorial state or
-- preference fields here. Those are returned only by controlled RPCs.
GRANT SELECT (
  id,
  username,
  display_name,
  avatar_url,
  level,
  xp,
  created_at
) ON TABLE public.profiles TO anon, authenticated;

-- Service role remains unrestricted for trusted server-side jobs.
GRANT SELECT ON TABLE public.profiles TO service_role;
