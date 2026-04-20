-- =============================================================
-- Wave A.2: Multi-format gamification + per-format AI signals
-- =============================================================

-- 1) Achievements multi-format (Mestre dos Mangás, Herói das HQs, Explorador de Revistas)
INSERT INTO public.achievements (code, title, description, icon, category, threshold, xp_reward) VALUES
  ('manga_5',         'Otaku Iniciante',     'Adicionou 5 mangás à biblioteca',         '📖', 'manga',    5,   30),
  ('manga_25',        'Mestre dos Mangás',   'Leu 25 volumes de mangá',                 '🎌', 'manga',    25,  150),
  ('manga_100',       'Sensei',              'Leu 100 volumes de mangá',                '🐉', 'manga',    100, 500),
  ('comic_5',         'Leitor de HQs',       'Adicionou 5 quadrinhos',                  '🦸', 'comic',    5,   30),
  ('comic_25',        'Herói dos Quadrinhos','Leu 25 edições de HQ',                    '⚡', 'comic',    25,  150),
  ('magazine_5',      'Curioso',             'Adicionou 5 revistas',                    '📰', 'magazine', 5,   25),
  ('magazine_25',     'Explorador de Revistas','Leu 25 edições de revista',             '🗞️', 'magazine', 25,  120),
  ('multiformat_3',   'Eclético',            'Tem livros em 3 formatos diferentes',     '🌈', 'meta',     3,   100)
ON CONFLICT (code) DO NOTHING;

-- 2) Challenge templates por content_type (tag identifica o formato)
INSERT INTO public.challenge_templates (code, title, description, icon, category, metric, target, xp_reward, weight, tags) VALUES
  ('daily_manga_volume',  'Volume do dia',         'Termine 1 volume de mangá hoje',         'BookOpen',  'daily',   'manga_volumes_today',  1,  20, 8,  ARRAY['manga']),
  ('weekly_manga_3',      'Maratona Otaku',        'Leia 3 volumes de mangá esta semana',    'Sparkles',  'weekly',  'manga_volumes_week',   3,  60, 6,  ARRAY['manga']),
  ('daily_comic_issue',   'Edição do dia',         'Termine 1 edição de HQ hoje',            'Zap',       'daily',   'comic_issues_today',   1,  20, 7,  ARRAY['comic']),
  ('weekly_comic_4',      'Universo Cinematográfico','Leia 4 HQs esta semana',               'Star',      'weekly',  'comic_issues_week',    4,  70, 5,  ARRAY['comic']),
  ('daily_magazine_read', 'Edição rápida',         'Leia 1 revista hoje',                    'Newspaper', 'daily',   'magazine_today',       1,  15, 4,  ARRAY['magazine']),
  ('weekly_explorer',     'Explorador',            'Adicione livros em 2 formatos diferentes esta semana', 'Compass', 'weekly', 'formats_added_week', 2, 50, 5, ARRAY['meta'])
ON CONFLICT (code) DO NOTHING;

-- 3) Função: contar formatos distintos do usuário (para achievement multiformat)
CREATE OR REPLACE FUNCTION public.user_format_count(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT b.content_type)::int
  FROM public.user_books ub
  JOIN public.books b ON b.id = ub.book_id
  WHERE ub.user_id = _user_id;
$$;

-- 4) Estender check_achievements para multi-formato
CREATE OR REPLACE FUNCTION public.check_achievements(_user_id uuid)
RETURNS TABLE(unlocked_code text, title text, xp_reward integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_books_read int;
  v_books_total int;
  v_reviews int;
  v_followers int;
  v_streak int;
  v_manga int;
  v_manga_read int;
  v_comic int;
  v_comic_read int;
  v_magazine int;
  v_magazine_read int;
  v_formats int;
  v_ach record;
BEGIN
  -- contagens base
  SELECT COUNT(*) INTO v_books_read
    FROM public.user_books WHERE user_id = _user_id AND status = 'read';
  SELECT COUNT(*) INTO v_books_total
    FROM public.user_books WHERE user_id = _user_id;
  SELECT COUNT(*) INTO v_reviews
    FROM public.reviews WHERE user_id = _user_id;
  SELECT COUNT(*) INTO v_followers
    FROM public.follows WHERE following_id = _user_id;
  SELECT COALESCE(current_days, 0) INTO v_streak
    FROM public.user_streaks WHERE user_id = _user_id;

  -- por formato
  SELECT COUNT(*) INTO v_manga FROM public.user_books ub
    JOIN public.books b ON b.id = ub.book_id
    WHERE ub.user_id = _user_id AND b.content_type = 'manga';
  SELECT COUNT(*) INTO v_manga_read FROM public.user_books ub
    JOIN public.books b ON b.id = ub.book_id
    WHERE ub.user_id = _user_id AND b.content_type = 'manga' AND ub.status = 'read';

  SELECT COUNT(*) INTO v_comic FROM public.user_books ub
    JOIN public.books b ON b.id = ub.book_id
    WHERE ub.user_id = _user_id AND b.content_type = 'comic';
  SELECT COUNT(*) INTO v_comic_read FROM public.user_books ub
    JOIN public.books b ON b.id = ub.book_id
    WHERE ub.user_id = _user_id AND b.content_type = 'comic' AND ub.status = 'read';

  SELECT COUNT(*) INTO v_magazine FROM public.user_books ub
    JOIN public.books b ON b.id = ub.book_id
    WHERE ub.user_id = _user_id AND b.content_type = 'magazine';
  SELECT COUNT(*) INTO v_magazine_read FROM public.user_books ub
    JOIN public.books b ON b.id = ub.book_id
    WHERE ub.user_id = _user_id AND b.content_type = 'magazine' AND ub.status = 'read';

  v_formats := public.user_format_count(_user_id);

  -- Avaliar todos os achievements
  FOR v_ach IN
    SELECT a.code, a.title, a.xp_reward, a.category, a.threshold
    FROM public.achievements a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_achievements ua
      WHERE ua.user_id = _user_id AND ua.achievement_code = a.code
    )
  LOOP
    DECLARE met boolean := false;
    BEGIN
      met := CASE v_ach.category
        WHEN 'reading'  THEN v_books_read   >= COALESCE(v_ach.threshold, 0)
        WHEN 'library'  THEN v_books_total  >= COALESCE(v_ach.threshold, 0)
        WHEN 'reviews'  THEN v_reviews      >= COALESCE(v_ach.threshold, 0)
        WHEN 'social'   THEN v_followers    >= COALESCE(v_ach.threshold, 0)
        WHEN 'streak'   THEN v_streak       >= COALESCE(v_ach.threshold, 0)
        WHEN 'manga'    THEN (CASE WHEN v_ach.code = 'manga_5' THEN v_manga ELSE v_manga_read END) >= COALESCE(v_ach.threshold, 0)
        WHEN 'comic'    THEN (CASE WHEN v_ach.code = 'comic_5' THEN v_comic ELSE v_comic_read END) >= COALESCE(v_ach.threshold, 0)
        WHEN 'magazine' THEN (CASE WHEN v_ach.code = 'magazine_5' THEN v_magazine ELSE v_magazine_read END) >= COALESCE(v_ach.threshold, 0)
        WHEN 'meta'     THEN v_formats      >= COALESCE(v_ach.threshold, 0)
        ELSE false
      END;

      IF met THEN
        INSERT INTO public.user_achievements (user_id, achievement_code)
        VALUES (_user_id, v_ach.code)
        ON CONFLICT DO NOTHING;
        PERFORM public.add_xp(_user_id, v_ach.xp_reward, 'achievement', jsonb_build_object('code', v_ach.code));
        unlocked_code := v_ach.code;
        title := v_ach.title;
        xp_reward := v_ach.xp_reward;
        RETURN NEXT;
      END IF;
    END;
  END LOOP;

  RETURN;
END;
$$;