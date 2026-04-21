-- 1) Tabela stories (24h)
CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'quote',
  content text,
  bg_color text DEFAULT 'gradient-gold',
  current_page integer,
  total_pages integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_stories_user_expires ON public.stories(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON public.stories(expires_at);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stories são públicas e visíveis enquanto ativas"
  ON public.stories FOR SELECT
  USING (expires_at > now());

CREATE POLICY "Usuário cria suas próprias stories"
  ON public.stories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário deleta suas próprias stories"
  ON public.stories FOR DELETE
  USING (auth.uid() = user_id);

-- 2) Tabela story_views (quem viu)
CREATE TABLE IF NOT EXISTS public.story_views (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autor vê quem viu sua story"
  ON public.story_views FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Usuário registra própria visualização"
  ON public.story_views FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3) Validador: garante que expires_at fique no futuro só na inserção
CREATE OR REPLACE FUNCTION public.stories_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NULL OR NEW.expires_at <= NEW.created_at THEN
    NEW.expires_at := NEW.created_at + interval '24 hours';
  END IF;
  IF NEW.kind NOT IN ('quote','progress','milestone','recommendation') THEN
    RAISE EXCEPTION 'invalid story kind: %', NEW.kind;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stories_validate ON public.stories;
CREATE TRIGGER trg_stories_validate
  BEFORE INSERT ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.stories_validate();

-- 4) RPC: stories ativas dos seguidos + próprias, agrupadas
CREATE OR REPLACE FUNCTION public.get_following_stories(_user_id uuid)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  story_count integer,
  has_unseen boolean,
  latest_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible AS (
    SELECT s.*
    FROM public.stories s
    WHERE s.expires_at > now()
      AND (
        s.user_id = _user_id
        OR s.user_id IN (SELECT following_id FROM public.follows WHERE follower_id = _user_id)
      )
  ),
  with_seen AS (
    SELECT
      v.*,
      EXISTS(
        SELECT 1 FROM public.story_views sv
        WHERE sv.story_id = v.id AND sv.user_id = _user_id
      ) AS seen
    FROM visible v
  )
  SELECT
    ws.user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    COUNT(*)::int AS story_count,
    BOOL_OR(NOT ws.seen) AS has_unseen,
    MAX(ws.created_at) AS latest_at
  FROM with_seen ws
  JOIN public.profiles p ON p.id = ws.user_id
  GROUP BY ws.user_id, p.display_name, p.username, p.avatar_url
  ORDER BY (ws.user_id = _user_id) DESC, BOOL_OR(NOT ws.seen) DESC, MAX(ws.created_at) DESC;
$$;

-- 5) Realtime para mensagens de clube e stories
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;