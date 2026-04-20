-- 1) profiles: respeitar profile_visibility
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_visible
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (
  COALESCE(profile_visibility, 'public') = 'public'
  OR auth.uid() = id
);

-- 2) follows: somente autenticados podem ver o grafo social
DROP POLICY IF EXISTS follows_select_all ON public.follows;
CREATE POLICY follows_select_authenticated
ON public.follows
FOR SELECT
TO authenticated
USING (true);

-- 3) user_streaks: somente autenticados
DROP POLICY IF EXISTS streaks_select_public ON public.user_streaks;
CREATE POLICY streaks_select_authenticated
ON public.user_streaks
FOR SELECT
TO authenticated
USING (true);

-- 4) user_achievements: somente autenticados
DROP POLICY IF EXISTS ua_select_all ON public.user_achievements;
CREATE POLICY ua_select_authenticated
ON public.user_achievements
FOR SELECT
TO authenticated
USING (true);

-- 5) review_likes: somente autenticados
DROP POLICY IF EXISTS likes_select_all ON public.review_likes;
CREATE POLICY likes_select_authenticated
ON public.review_likes
FOR SELECT
TO authenticated
USING (true);