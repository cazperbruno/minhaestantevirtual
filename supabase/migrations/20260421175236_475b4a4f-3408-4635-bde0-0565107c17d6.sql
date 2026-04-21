
-- ============================================================
-- SOCIAL ACTIVITIES — likes, comments, auto-triggers, realtime
-- ============================================================

-- 1) Tabelas de engajamento em atividades
CREATE TABLE IF NOT EXISTS public.activity_likes (
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.activity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_likes_activity ON public.activity_likes(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_comments_activity ON public.activity_comments(activity_id, created_at DESC);

-- Contadores agregados em activities (apenas se ainda não existem)
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.activity_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_comments ENABLE ROW LEVEL SECURITY;

-- RLS: pode ver/curtir/comentar quando a activity é visível para o usuário
DROP POLICY IF EXISTS al_select ON public.activity_likes;
CREATE POLICY al_select ON public.activity_likes FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.activities a
  WHERE a.id = activity_likes.activity_id
    AND ((auth.uid() = a.user_id) OR (
      a.is_public = true
      AND a.kind <> 'book_lent'
      AND COALESCE((SELECT profile_visibility FROM public.profiles WHERE id = a.user_id), 'public') = 'public'
    ))
));

DROP POLICY IF EXISTS al_insert ON public.activity_likes;
CREATE POLICY al_insert ON public.activity_likes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND EXISTS (
  SELECT 1 FROM public.activities a
  WHERE a.id = activity_likes.activity_id
    AND ((auth.uid() = a.user_id) OR (a.is_public = true))
));

DROP POLICY IF EXISTS al_delete ON public.activity_likes;
CREATE POLICY al_delete ON public.activity_likes FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ac_select ON public.activity_comments;
CREATE POLICY ac_select ON public.activity_comments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.activities a
  WHERE a.id = activity_comments.activity_id
    AND ((auth.uid() = a.user_id) OR (
      a.is_public = true
      AND COALESCE((SELECT profile_visibility FROM public.profiles WHERE id = a.user_id), 'public') = 'public'
    ))
));

DROP POLICY IF EXISTS ac_insert ON public.activity_comments;
CREATE POLICY ac_insert ON public.activity_comments FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND EXISTS (
  SELECT 1 FROM public.activities a
  WHERE a.id = activity_comments.activity_id
    AND ((auth.uid() = a.user_id) OR (a.is_public = true))
));

DROP POLICY IF EXISTS ac_delete ON public.activity_comments;
CREATE POLICY ac_delete ON public.activity_comments FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 2) Triggers de contagem
CREATE OR REPLACE FUNCTION public.bump_activity_counts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'activity_likes' THEN
      UPDATE public.activities SET likes_count = likes_count + 1 WHERE id = NEW.activity_id;
    ELSE
      UPDATE public.activities SET comments_count = comments_count + 1 WHERE id = NEW.activity_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'activity_likes' THEN
      UPDATE public.activities SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.activity_id;
    ELSE
      UPDATE public.activities SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.activity_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_activity_likes_count ON public.activity_likes;
CREATE TRIGGER trg_activity_likes_count
AFTER INSERT OR DELETE ON public.activity_likes
FOR EACH ROW EXECUTE FUNCTION public.bump_activity_counts();

DROP TRIGGER IF EXISTS trg_activity_comments_count ON public.activity_comments;
CREATE TRIGGER trg_activity_comments_count
AFTER INSERT OR DELETE ON public.activity_comments
FOR EACH ROW EXECUTE FUNCTION public.bump_activity_counts();

-- 3) Helper: atividade pública só se perfil + biblioteca permitirem
CREATE OR REPLACE FUNCTION public.activity_is_public(_user_id uuid, _book_is_public boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(_book_is_public, true)
    AND COALESCE((SELECT library_visibility FROM public.profiles WHERE id = _user_id), 'public') = 'public'
    AND COALESCE((SELECT profile_visibility FROM public.profiles WHERE id = _user_id), 'public') = 'public'
$$;

-- 4) Auto-geração de atividades a partir de user_books
CREATE OR REPLACE FUNCTION public.user_books_to_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _public boolean;
BEGIN
  _public := public.activity_is_public(NEW.user_id, NEW.is_public);

  IF TG_OP = 'INSERT' THEN
    -- "adicionou livro"
    INSERT INTO public.activities (user_id, kind, book_id, is_public, meta)
    VALUES (NEW.user_id, 'book_added', NEW.book_id, _public, jsonb_build_object('status', NEW.status));

    -- já cria os marcos derivados se entrou direto como reading/read
    IF NEW.status = 'reading' THEN
      INSERT INTO public.activities (user_id, kind, book_id, is_public)
      VALUES (NEW.user_id, 'started_reading', NEW.book_id, _public);
    ELSIF NEW.status = 'read' THEN
      INSERT INTO public.activities (user_id, kind, book_id, is_public)
      VALUES (NEW.user_id, 'finished_reading', NEW.book_id, _public);
    END IF;

    IF NEW.rating IS NOT NULL AND NEW.rating > 0 THEN
      INSERT INTO public.activities (user_id, kind, book_id, is_public, meta)
      VALUES (NEW.user_id, 'book_rated', NEW.book_id, _public, jsonb_build_object('rating', NEW.rating));
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE: detectar transições
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'reading' THEN
      INSERT INTO public.activities (user_id, kind, book_id, is_public)
      VALUES (NEW.user_id, 'started_reading', NEW.book_id, _public);
    ELSIF NEW.status = 'read' THEN
      INSERT INTO public.activities (user_id, kind, book_id, is_public)
      VALUES (NEW.user_id, 'finished_reading', NEW.book_id, _public);
    END IF;
  END IF;

  IF NEW.rating IS DISTINCT FROM OLD.rating AND NEW.rating IS NOT NULL AND NEW.rating > 0 THEN
    INSERT INTO public.activities (user_id, kind, book_id, is_public, meta)
    VALUES (NEW.user_id, 'book_rated', NEW.book_id, _public, jsonb_build_object('rating', NEW.rating));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_books_activity ON public.user_books;
CREATE TRIGGER trg_user_books_activity
AFTER INSERT OR UPDATE ON public.user_books
FOR EACH ROW EXECUTE FUNCTION public.user_books_to_activity();

-- 5) Auto-geração ao seguir
CREATE OR REPLACE FUNCTION public.follows_to_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _public boolean;
BEGIN
  _public := COALESCE((SELECT profile_visibility FROM public.profiles WHERE id = NEW.follower_id), 'public') = 'public';
  INSERT INTO public.activities (user_id, kind, target_user_id, is_public)
  VALUES (NEW.follower_id, 'followed_user', NEW.following_id, _public);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_follows_activity ON public.follows;
CREATE TRIGGER trg_follows_activity
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.follows_to_activity();

-- 6) Realtime para as novas tabelas
ALTER TABLE public.activity_likes REPLICA IDENTITY FULL;
ALTER TABLE public.activity_comments REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_likes;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_comments;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
