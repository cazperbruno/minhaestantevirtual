-- ==========================================
-- FASE 3: Social + Gamificação
-- ==========================================

-- 1) Reviews públicas (separadas das notas privadas em user_books)
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  is_public boolean NOT NULL DEFAULT true,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY reviews_select_public_or_own ON public.reviews FOR SELECT
  USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY reviews_insert_own ON public.reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY reviews_update_own ON public.reviews FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY reviews_delete_own ON public.reviews FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX reviews_book_idx ON public.reviews(book_id);
CREATE INDEX reviews_user_idx ON public.reviews(user_id);
CREATE INDEX reviews_created_idx ON public.reviews(created_at DESC);

CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Curtidas em reviews
CREATE TABLE public.review_likes (
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);

ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY likes_select_all ON public.review_likes FOR SELECT USING (true);
CREATE POLICY likes_insert_own ON public.review_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY likes_delete_own ON public.review_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para atualizar contador de likes
CREATE OR REPLACE FUNCTION public.update_review_likes_count()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET likes_count = likes_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reviews SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.review_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER review_likes_count_trg
  AFTER INSERT OR DELETE ON public.review_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_review_likes_count();

-- 3) Follows entre usuários
CREATE TABLE public.follows (
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY follows_select_all ON public.follows FOR SELECT USING (true);
CREATE POLICY follows_insert_own ON public.follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);
CREATE POLICY follows_delete_own ON public.follows FOR DELETE
  USING (auth.uid() = follower_id);

CREATE INDEX follows_following_idx ON public.follows(following_id);

-- 4) Catálogo de conquistas
CREATE TABLE public.achievements (
  code text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  xp_reward integer NOT NULL DEFAULT 0,
  threshold integer,
  category text NOT NULL
);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY achievements_select_all ON public.achievements FOR SELECT USING (true);

INSERT INTO public.achievements (code, title, description, icon, xp_reward, threshold, category) VALUES
  ('first_book',     'Primeira página',    'Adicione seu primeiro livro à biblioteca',  'BookOpen',  20,  1,  'library'),
  ('shelf_10',       'Estante crescendo',  'Tenha 10 livros na biblioteca',             'Library',   50,  10, 'library'),
  ('shelf_50',       'Bibliófilo',         'Tenha 50 livros na biblioteca',             'Library',  150,  50, 'library'),
  ('first_finish',   'Concluído',          'Termine seu primeiro livro',                'Check',     30,  1,  'reading'),
  ('finish_10',      'Maratona literária', 'Termine 10 livros',                         'Trophy',   100, 10, 'reading'),
  ('finish_25',      'Devorador',          'Termine 25 livros',                         'Trophy',   250, 25, 'reading'),
  ('first_review',   'Crítico em ascensão','Publique sua primeira resenha',             'Star',      30,  1,  'social'),
  ('review_10',      'Voz da estante',     'Publique 10 resenhas',                      'Star',     120, 10, 'social'),
  ('first_loan',     'Generoso',           'Empreste seu primeiro livro',               'ArrowRightLeft', 20, 1, 'loans'),
  ('streak_5',       'Constante',          'Adicione livros por 5 dias diferentes',     'Flame',     80,  5, 'streak');

-- 5) Conquistas desbloqueadas pelo usuário
CREATE TABLE public.user_achievements (
  user_id uuid NOT NULL,
  achievement_code text NOT NULL REFERENCES public.achievements(code) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_code)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY ua_select_all ON public.user_achievements FOR SELECT USING (true);
CREATE POLICY ua_insert_own ON public.user_achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6) Função para conceder XP e recalcular nível (XP * 100 por nível)
CREATE OR REPLACE FUNCTION public.grant_xp(_user_id uuid, _amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_xp integer; new_level integer;
BEGIN
  UPDATE public.profiles
    SET xp = xp + _amount,
        level = GREATEST(1, FLOOR((xp + _amount) / 100.0)::int + 1),
        updated_at = now()
    WHERE id = _user_id
    RETURNING xp, level INTO new_xp, new_level;
END $$;

-- 7) Função para verificar e desbloquear conquistas (chamada pelo cliente)
CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)
RETURNS TABLE(unlocked_code text, title text, xp_reward integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lib_count int; finished_count int; review_count int; loan_count int;
  ach record; granted_xp int;
BEGIN
  SELECT count(*) INTO lib_count FROM public.user_books WHERE user_id = _user_id;
  SELECT count(*) INTO finished_count FROM public.user_books WHERE user_id = _user_id AND status = 'read';
  SELECT count(*) INTO review_count FROM public.reviews WHERE user_id = _user_id;
  SELECT count(*) INTO loan_count FROM public.loans WHERE user_id = _user_id;

  FOR ach IN SELECT * FROM public.achievements LOOP
    IF EXISTS (SELECT 1 FROM public.user_achievements WHERE user_id = _user_id AND achievement_code = ach.code) THEN
      CONTINUE;
    END IF;
    IF (ach.category = 'library' AND lib_count >= ach.threshold)
       OR (ach.category = 'reading' AND finished_count >= ach.threshold)
       OR (ach.category = 'social' AND review_count >= ach.threshold)
       OR (ach.category = 'loans' AND loan_count >= ach.threshold) THEN
      INSERT INTO public.user_achievements (user_id, achievement_code) VALUES (_user_id, ach.code);
      PERFORM public.grant_xp(_user_id, ach.xp_reward);
      unlocked_code := ach.code; title := ach.title; xp_reward := ach.xp_reward;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

CREATE TRIGGER reviews_xp_grant AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at(); -- noop placeholder; XP via check_achievements

-- 8) View de ranking público
CREATE OR REPLACE VIEW public.ranking_view
WITH (security_invoker = true) AS
SELECT
  p.id, p.display_name, p.username, p.avatar_url, p.xp, p.level,
  (SELECT count(*) FROM public.user_books ub WHERE ub.user_id = p.id AND ub.status = 'read') AS books_read,
  (SELECT count(*) FROM public.reviews r WHERE r.user_id = p.id AND r.is_public = true) AS reviews_count,
  RANK() OVER (ORDER BY p.xp DESC) AS position
FROM public.profiles p
WHERE p.xp > 0;