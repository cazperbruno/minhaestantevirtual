-- 1. Enum de categorias curadas
DO $$ BEGIN
  CREATE TYPE public.club_category AS ENUM (
    'manga','fantasia','romance','hq','autoajuda',
    'classicos','nao_ficcao','sci_fi','terror','infantojuvenil','geral'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Adiciona category em book_clubs
ALTER TABLE public.book_clubs
  ADD COLUMN IF NOT EXISTS category public.club_category NOT NULL DEFAULT 'geral';

CREATE INDEX IF NOT EXISTS idx_book_clubs_category ON public.book_clubs(category);

-- 3. Adiciona last_seen_at em club_members
ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_club_members_last_seen ON public.club_members(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_members_club_last_seen ON public.club_members(club_id, last_seen_at DESC);

-- 4. RPC para sumário das categorias (agregado, seguro)
CREATE OR REPLACE FUNCTION public.clubs_categories_summary()
RETURNS TABLE(
  category public.club_category,
  clubs_count bigint,
  members_count bigint,
  online_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    bc.category,
    COUNT(DISTINCT bc.id) AS clubs_count,
    COUNT(DISTINCT cm.user_id) AS members_count,
    COUNT(DISTINCT cm.user_id) FILTER (WHERE cm.last_seen_at > now() - interval '5 minutes') AS online_count
  FROM public.book_clubs bc
  LEFT JOIN public.club_members cm ON cm.club_id = bc.id
  GROUP BY bc.category;
$$;

REVOKE ALL ON FUNCTION public.clubs_categories_summary() FROM public;
GRANT EXECUTE ON FUNCTION public.clubs_categories_summary() TO authenticated;

-- 5. RPC para registrar presença (heartbeat) — só o próprio membro
CREATE OR REPLACE FUNCTION public.touch_club_presence(_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.club_members
  SET last_seen_at = now()
  WHERE club_id = _club_id
    AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.touch_club_presence(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.touch_club_presence(uuid) TO authenticated;

-- 6. RPC para contar online em um clube específico (cards detalhados)
CREATE OR REPLACE FUNCTION public.club_online_count(_club_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.club_members
  WHERE club_id = _club_id
    AND last_seen_at > now() - interval '5 minutes';
$$;

REVOKE ALL ON FUNCTION public.club_online_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.club_online_count(uuid) TO authenticated;