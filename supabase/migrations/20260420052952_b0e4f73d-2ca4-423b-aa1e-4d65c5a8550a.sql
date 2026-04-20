-- 1) user_streaks: respeitar profile_visibility
DROP POLICY IF EXISTS streaks_select_authenticated ON public.user_streaks;
CREATE POLICY streaks_select_visible
ON public.user_streaks
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR COALESCE(
    (SELECT profile_visibility FROM public.profiles WHERE id = user_streaks.user_id),
    'public'
  ) = 'public'
);

-- 2) user_achievements: respeitar profile_visibility
DROP POLICY IF EXISTS ua_select_authenticated ON public.user_achievements;
CREATE POLICY ua_select_visible
ON public.user_achievements
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR COALESCE(
    (SELECT profile_visibility FROM public.profiles WHERE id = user_achievements.user_id),
    'public'
  ) = 'public'
);

-- 3) Tirar notifications do publication realtime — evita broadcast cross-user
--    O sino continua funcionando via fetch normal (já invalidado pelo react-query).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications';
  END IF;
END $$;

-- 4) Storage: impedir listagem indiscriminada do bucket book-covers
--    (acesso direto a uma URL específica continua funcionando)
DROP POLICY IF EXISTS "Public bucket book-covers list" ON storage.objects;
DROP POLICY IF EXISTS "book-covers public list" ON storage.objects;