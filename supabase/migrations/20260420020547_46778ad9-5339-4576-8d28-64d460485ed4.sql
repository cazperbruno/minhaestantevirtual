-- Privacidade + perfil expandido (redes sociais)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS library_visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS tiktok text,
  ADD COLUMN IF NOT EXISTS twitter text,
  ADD COLUMN IF NOT EXISTS website text;

-- Validação dos valores permitidos via trigger (CHECK seria suficiente, mas trigger permite evolução)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_visibility_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_visibility_chk
  CHECK (profile_visibility IN ('public','private')
     AND library_visibility IN ('public','followers','private'));

-- Garantir índice case-insensitive em username (lookup do /u/:username)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uniq
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Função utilitária: usuário A segue B?
CREATE OR REPLACE FUNCTION public.is_following(_follower uuid, _following uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = _follower AND following_id = _following
  );
$$;

-- Função: posso ver a biblioteca deste usuário?
CREATE OR REPLACE FUNCTION public.can_view_library(_owner uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    CASE
      WHEN _owner = _viewer THEN true
      WHEN (SELECT profile_visibility FROM public.profiles WHERE id = _owner) = 'private' THEN false
      WHEN (SELECT library_visibility FROM public.profiles WHERE id = _owner) = 'public' THEN true
      WHEN (SELECT library_visibility FROM public.profiles WHERE id = _owner) = 'followers'
        THEN public.is_following(_viewer, _owner)
      ELSE false
    END
$$;

-- Atualizar RLS de user_books para respeitar a visibilidade
DROP POLICY IF EXISTS ub_select_public_or_own ON public.user_books;
CREATE POLICY ub_select_visible ON public.user_books
  FOR SELECT USING (
    auth.uid() = user_id
    OR (is_public = true AND public.can_view_library(user_id, auth.uid()))
  );

-- Reviews: respeitar perfil privado também
DROP POLICY IF EXISTS reviews_select_public_or_own ON public.reviews;
CREATE POLICY reviews_select_visible ON public.reviews
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      is_public = true
      AND COALESCE(
        (SELECT profile_visibility FROM public.profiles WHERE id = user_id),
        'public'
      ) = 'public'
    )
  );

-- Atividades: idem
DROP POLICY IF EXISTS activities_select_public_or_own ON public.activities;
CREATE POLICY activities_select_visible ON public.activities
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      is_public = true
      AND COALESCE(
        (SELECT profile_visibility FROM public.profiles WHERE id = user_id),
        'public'
      ) = 'public'
    )
  );