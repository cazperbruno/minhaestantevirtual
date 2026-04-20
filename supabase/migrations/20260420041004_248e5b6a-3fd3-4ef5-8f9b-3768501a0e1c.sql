-- =====================================================================
-- ONDA 1 — Sistema de Gamificação Completa (níveis + desafios + streak + convites)
-- =====================================================================

-- 1. CURVA DE NÍVEIS (quadrática: nível N requer 50 * N² XP totais)
CREATE OR REPLACE FUNCTION public.xp_for_level(_level int)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT GREATEST(0, 50 * _level * _level)::int
$$;

CREATE OR REPLACE FUNCTION public.level_for_xp(_xp int)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(_xp, 0) / 50.0))::int + 1)
$$;

-- 2. LOG DE EVENTOS DE XP
CREATE TABLE IF NOT EXISTS public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount int NOT NULL,
  source text NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xp_events_user_idx ON public.xp_events(user_id, created_at DESC);

ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xp_events_select_own" ON public.xp_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "xp_events_insert_own" ON public.xp_events FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. NOVA add_xp (substitui grant_xp com retorno de level-up)
CREATE OR REPLACE FUNCTION public.add_xp(_user_id uuid, _amount int, _source text DEFAULT 'misc', _meta jsonb DEFAULT NULL)
RETURNS TABLE(new_xp int, new_level int, leveled_up boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_level int; updated_xp int; updated_level int;
BEGIN
  IF _amount IS NULL OR _amount = 0 THEN
    SELECT xp, level INTO updated_xp, updated_level FROM public.profiles WHERE id = _user_id;
    RETURN QUERY SELECT updated_xp, updated_level, false;
    RETURN;
  END IF;

  SELECT level INTO old_level FROM public.profiles WHERE id = _user_id;

  UPDATE public.profiles
    SET xp = GREATEST(0, xp + _amount),
        updated_at = now()
    WHERE id = _user_id
    RETURNING xp INTO updated_xp;

  updated_level := public.level_for_xp(updated_xp);

  UPDATE public.profiles SET level = updated_level WHERE id = _user_id AND level <> updated_level;

  INSERT INTO public.xp_events (user_id, amount, source, meta)
  VALUES (_user_id, _amount, _source, _meta);

  RETURN QUERY SELECT updated_xp, updated_level, (updated_level > COALESCE(old_level, 1));
END $$;

-- 4. STREAK DIÁRIO
CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id uuid PRIMARY KEY,
  current_days int NOT NULL DEFAULT 0,
  longest_days int NOT NULL DEFAULT 0,
  last_active_date date,
  next_milestone int NOT NULL DEFAULT 7,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "streaks_select_own" ON public.user_streaks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "streaks_select_public" ON public.user_streaks FOR SELECT USING (true);
DROP POLICY "streaks_select_own" ON public.user_streaks;

CREATE OR REPLACE FUNCTION public.update_streak(_user_id uuid)
RETURNS TABLE(current_days int, milestone_hit int, bonus_xp int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record; today date := CURRENT_DATE; new_current int := 1; bonus int := 0; hit int := 0;
BEGIN
  SELECT * INTO s FROM public.user_streaks WHERE user_id = _user_id;

  IF s IS NULL THEN
    INSERT INTO public.user_streaks (user_id, current_days, longest_days, last_active_date, next_milestone)
    VALUES (_user_id, 1, 1, today, 7);
    RETURN QUERY SELECT 1, 0, 0;
    RETURN;
  END IF;

  IF s.last_active_date = today THEN
    RETURN QUERY SELECT s.current_days, 0, 0;
    RETURN;
  ELSIF s.last_active_date = today - 1 THEN
    new_current := s.current_days + 1;
  ELSE
    new_current := 1;
  END IF;

  -- Bônus em marcos: 7/30/100/365
  IF new_current IN (7, 30, 100, 365) THEN
    hit := new_current;
    bonus := CASE new_current WHEN 7 THEN 50 WHEN 30 THEN 200 WHEN 100 THEN 1000 WHEN 365 THEN 5000 END;
    PERFORM public.add_xp(_user_id, bonus, 'streak_milestone', jsonb_build_object('days', new_current));
  END IF;

  UPDATE public.user_streaks
    SET current_days = new_current,
        longest_days = GREATEST(longest_days, new_current),
        last_active_date = today,
        next_milestone = CASE
          WHEN new_current < 7 THEN 7
          WHEN new_current < 30 THEN 30
          WHEN new_current < 100 THEN 100
          WHEN new_current < 365 THEN 365
          ELSE 365
        END,
        updated_at = now()
    WHERE user_id = _user_id;

  RETURN QUERY SELECT new_current, hit, bonus;
END $$;

-- 5. DESAFIOS — Templates e Atribuições
CREATE TABLE IF NOT EXISTS public.challenge_templates (
  code text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'Target',
  category text NOT NULL CHECK (category IN ('daily','weekly','epic')),
  metric text NOT NULL,         -- 'add_book' | 'finish_book' | 'rate_book' | 'scan_book' | 'like_review' | 'comment_review' | 'follow' | 'club_message' | 'loan_book' | 'open_app'
  target int NOT NULL,
  xp_reward int NOT NULL DEFAULT 25,
  tags text[] DEFAULT '{}',     -- afinidade (genres, etc.)
  weight int NOT NULL DEFAULT 10
);
ALTER TABLE public.challenge_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_select_all" ON public.challenge_templates FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.user_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_code text NOT NULL REFERENCES public.challenge_templates(code) ON DELETE CASCADE,
  category text NOT NULL,
  progress int NOT NULL DEFAULT 0,
  target int NOT NULL,
  xp_reward int NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','claimed','expired')),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_challenges_user_idx ON public.user_challenges(user_id, status, expires_at);

ALTER TABLE public.user_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uc_select_own" ON public.user_challenges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "uc_insert_own" ON public.user_challenges FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "uc_update_own" ON public.user_challenges FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "uc_delete_own" ON public.user_challenges FOR DELETE USING (auth.uid() = user_id);

-- 6. RECOMPUTAR PROGRESSO COM BASE EM AÇÕES REAIS
CREATE OR REPLACE FUNCTION public.recompute_challenge_progress(_user_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ch record; new_progress int; updated_count int := 0;
BEGIN
  FOR ch IN
    SELECT uc.*, ct.metric
    FROM public.user_challenges uc
    JOIN public.challenge_templates ct ON ct.code = uc.template_code
    WHERE uc.user_id = _user_id AND uc.status = 'active' AND uc.expires_at > now()
  LOOP
    new_progress := CASE ch.metric
      WHEN 'add_book' THEN (
        SELECT COUNT(*)::int FROM public.user_books
        WHERE user_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'finish_book' THEN (
        SELECT COUNT(*)::int FROM public.user_books
        WHERE user_id = _user_id AND status = 'read' AND finished_at >= ch.created_at
      )
      WHEN 'rate_book' THEN (
        SELECT COUNT(*)::int FROM public.user_books
        WHERE user_id = _user_id AND rating IS NOT NULL AND updated_at >= ch.created_at
      )
      WHEN 'scan_book' THEN (
        SELECT COUNT(*)::int FROM public.user_interactions
        WHERE user_id = _user_id AND kind = 'scan' AND created_at >= ch.created_at
      )
      WHEN 'like_review' THEN (
        SELECT COUNT(*)::int FROM public.review_likes
        WHERE user_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'comment_review' THEN (
        SELECT COUNT(*)::int FROM public.review_comments
        WHERE user_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'write_review' THEN (
        SELECT COUNT(*)::int FROM public.reviews
        WHERE user_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'follow' THEN (
        SELECT COUNT(*)::int FROM public.follows
        WHERE follower_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'club_message' THEN (
        SELECT COUNT(*)::int FROM public.club_messages
        WHERE user_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'loan_book' THEN (
        SELECT COUNT(*)::int FROM public.loans
        WHERE user_id = _user_id AND created_at >= ch.created_at
      )
      WHEN 'open_app' THEN ch.progress  -- atualizado externamente
      ELSE ch.progress
    END;

    IF new_progress <> ch.progress OR (new_progress >= ch.target AND ch.status = 'active') THEN
      UPDATE public.user_challenges
        SET progress = LEAST(new_progress, ch.target),
            status = CASE WHEN new_progress >= ch.target THEN 'completed' ELSE 'active' END,
            completed_at = CASE WHEN new_progress >= ch.target AND completed_at IS NULL THEN now() ELSE completed_at END
        WHERE id = ch.id;
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  -- Expirar antigos
  UPDATE public.user_challenges
    SET status = 'expired'
    WHERE user_id = _user_id AND status = 'active' AND expires_at <= now();

  RETURN updated_count;
END $$;

-- 7. CLAIM (coletar XP de desafio concluído)
CREATE OR REPLACE FUNCTION public.claim_challenge(_user_id uuid, _challenge_id uuid)
RETURNS TABLE(success boolean, xp_granted int, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch record;
BEGIN
  SELECT * INTO ch FROM public.user_challenges WHERE id = _challenge_id AND user_id = _user_id;
  IF ch IS NULL THEN RETURN QUERY SELECT false, 0, 'not_found'::text; RETURN; END IF;
  IF ch.status = 'claimed' THEN RETURN QUERY SELECT false, 0, 'already_claimed'::text; RETURN; END IF;
  IF ch.status <> 'completed' THEN RETURN QUERY SELECT false, 0, 'not_completed'::text; RETURN; END IF;

  UPDATE public.user_challenges
    SET status = 'claimed', claimed_at = now()
    WHERE id = _challenge_id;

  PERFORM public.add_xp(_user_id, ch.xp_reward, 'challenge', jsonb_build_object('code', ch.template_code));

  RETURN QUERY SELECT true, ch.xp_reward, 'ok'::text;
END $$;

-- 8. ATRIBUIR DESAFIOS DIÁRIOS/SEMANAIS (adaptativo: usa user_taste)
CREATE OR REPLACE FUNCTION public.assign_daily_challenges(_user_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  daily_count int; weekly_count int; epic_count int;
  inserted int := 0; tpl record; expire_at timestamptz;
BEGIN
  -- Contar ativos por categoria
  SELECT COUNT(*) FILTER (WHERE category='daily'),
         COUNT(*) FILTER (WHERE category='weekly'),
         COUNT(*) FILTER (WHERE category='epic')
    INTO daily_count, weekly_count, epic_count
    FROM public.user_challenges
    WHERE user_id = _user_id AND status IN ('active','completed') AND expires_at > now();

  -- Daily: garantir 3
  IF daily_count < 3 THEN
    expire_at := (CURRENT_DATE + 1)::timestamptz; -- meia-noite seguinte
    FOR tpl IN
      SELECT * FROM public.challenge_templates
      WHERE category = 'daily'
        AND code NOT IN (
          SELECT template_code FROM public.user_challenges
          WHERE user_id = _user_id AND status IN ('active','completed') AND expires_at > now()
        )
      ORDER BY weight DESC, RANDOM()
      LIMIT (3 - daily_count)
    LOOP
      INSERT INTO public.user_challenges (user_id, template_code, category, target, xp_reward, expires_at)
      VALUES (_user_id, tpl.code, 'daily', tpl.target, tpl.xp_reward, expire_at);
      inserted := inserted + 1;
    END LOOP;
  END IF;

  -- Weekly: garantir 3
  IF weekly_count < 3 THEN
    expire_at := (CURRENT_DATE + (7 - EXTRACT(DOW FROM CURRENT_DATE)::int))::timestamptz + interval '1 day';
    FOR tpl IN
      SELECT * FROM public.challenge_templates
      WHERE category = 'weekly'
        AND code NOT IN (
          SELECT template_code FROM public.user_challenges
          WHERE user_id = _user_id AND status IN ('active','completed') AND expires_at > now()
        )
      ORDER BY weight DESC, RANDOM()
      LIMIT (3 - weekly_count)
    LOOP
      INSERT INTO public.user_challenges (user_id, template_code, category, target, xp_reward, expires_at)
      VALUES (_user_id, tpl.code, 'weekly', tpl.target, tpl.xp_reward, expire_at);
      inserted := inserted + 1;
    END LOOP;
  END IF;

  -- Epic: garantir 2 ativos (longa duração — 60 dias)
  IF epic_count < 2 THEN
    expire_at := now() + interval '60 days';
    FOR tpl IN
      SELECT * FROM public.challenge_templates
      WHERE category = 'epic'
        AND code NOT IN (
          SELECT template_code FROM public.user_challenges
          WHERE user_id = _user_id AND status IN ('active','completed','claimed')
        )
      ORDER BY weight DESC, RANDOM()
      LIMIT (2 - epic_count)
    LOOP
      INSERT INTO public.user_challenges (user_id, template_code, category, target, xp_reward, expires_at)
      VALUES (_user_id, tpl.code, 'epic', tpl.target, tpl.xp_reward, expire_at);
      inserted := inserted + 1;
    END LOOP;
  END IF;

  RETURN inserted;
END $$;

-- 9. CONVITES VIRAIS
CREATE TABLE IF NOT EXISTS public.invites (
  user_id uuid PRIMARY KEY,
  code text UNIQUE NOT NULL,
  signups_count int NOT NULL DEFAULT 0,
  xp_earned int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invites_select_all" ON public.invites FOR SELECT USING (true);
CREATE POLICY "invites_insert_own" ON public.invites FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.invite_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL,
  invitee_id uuid NOT NULL UNIQUE,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invite_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ir_select_involved" ON public.invite_redemptions FOR SELECT
  USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);

-- Gerar convite ao criar perfil
CREATE OR REPLACE FUNCTION public.ensure_invite(_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing text; new_code text;
BEGIN
  SELECT code INTO existing FROM public.invites WHERE user_id = _user_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  -- Gerar código de 6 chars (alfanumérico maiúsculo)
  LOOP
    new_code := UPPER(SUBSTRING(MD5(RANDOM()::text || _user_id::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.invites WHERE code = new_code);
  END LOOP;
  INSERT INTO public.invites (user_id, code) VALUES (_user_id, new_code);
  RETURN new_code;
END $$;

-- Resgatar convite
CREATE OR REPLACE FUNCTION public.redeem_invite(_code text, _new_user_id uuid)
RETURNS TABLE(success boolean, inviter_id uuid, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.invite_redemptions WHERE invitee_id = _new_user_id) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'already_redeemed'::text; RETURN;
  END IF;

  SELECT * INTO inv FROM public.invites WHERE code = UPPER(_code);
  IF inv IS NULL THEN RETURN QUERY SELECT false, NULL::uuid, 'invalid_code'::text; RETURN; END IF;
  IF inv.user_id = _new_user_id THEN RETURN QUERY SELECT false, NULL::uuid, 'self_invite'::text; RETURN; END IF;

  INSERT INTO public.invite_redemptions (inviter_id, invitee_id, code)
  VALUES (inv.user_id, _new_user_id, inv.code);

  -- XP para ambos
  PERFORM public.add_xp(inv.user_id, 200, 'invite_signup', jsonb_build_object('invitee', _new_user_id));
  PERFORM public.add_xp(_new_user_id, 100, 'invite_welcome', jsonb_build_object('inviter', inv.user_id));

  UPDATE public.invites
    SET signups_count = signups_count + 1, xp_earned = xp_earned + 200
    WHERE user_id = inv.user_id;

  -- Notificar quem convidou
  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  VALUES (inv.user_id, 'invite_redeemed',
          'Seu convite foi aceito! +200 XP',
          'Um novo leitor entrou no Readify pelo seu link.',
          '/progresso',
          jsonb_build_object('invitee_id', _new_user_id));

  RETURN QUERY SELECT true, inv.user_id, 'ok'::text;
END $$;

-- 10. VIEW: Ranking de embaixadores (convites)
CREATE OR REPLACE VIEW public.ambassadors_view AS
SELECT
  i.user_id AS id,
  p.display_name,
  p.username,
  p.avatar_url,
  i.signups_count,
  i.xp_earned,
  CASE
    WHEN i.signups_count >= 100 THEN 'Lenda da Leitura'
    WHEN i.signups_count >= 25  THEN 'Embaixador Readify'
    WHEN i.signups_count >= 10  THEN 'Influenciador Literário'
    WHEN i.signups_count >= 3   THEN 'Conector'
    WHEN i.signups_count >= 1   THEN 'Iniciante Social'
    ELSE 'Sem convites ainda'
  END AS tier,
  ROW_NUMBER() OVER (ORDER BY i.signups_count DESC, i.xp_earned DESC) AS position
FROM public.invites i
JOIN public.profiles p ON p.id = i.user_id
WHERE i.signups_count > 0;

-- 11. VIEW: Ranking semanal (XP nos últimos 7 dias)
CREATE OR REPLACE VIEW public.weekly_ranking_view AS
SELECT
  e.user_id AS id,
  p.display_name,
  p.username,
  p.avatar_url,
  p.level,
  COALESCE(SUM(e.amount), 0)::int AS weekly_xp,
  ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(e.amount), 0) DESC) AS position
FROM public.profiles p
LEFT JOIN public.xp_events e
  ON e.user_id = p.id AND e.created_at >= now() - interval '7 days'
GROUP BY e.user_id, p.id, p.display_name, p.username, p.avatar_url, p.level
HAVING COALESCE(SUM(e.amount), 0) > 0;

-- 12. SEED: 18 templates de desafios
INSERT INTO public.challenge_templates (code, title, description, icon, category, metric, target, xp_reward, weight) VALUES
  -- DAILY (6)
  ('d_open_app', 'Boa noite, leitor', 'Abra o Readify hoje', 'Sun', 'daily', 'open_app', 1, 10, 100),
  ('d_scan_1', 'Escaneie um livro', 'Use o scanner para adicionar 1 livro', 'ScanLine', 'daily', 'scan_book', 1, 25, 30),
  ('d_add_1', 'Cresça sua estante', 'Adicione 1 livro à biblioteca', 'BookPlus', 'daily', 'add_book', 1, 20, 50),
  ('d_like_3', 'Apoie a comunidade', 'Curta 3 resenhas no feed', 'Heart', 'daily', 'like_review', 3, 15, 40),
  ('d_rate_1', 'Dê sua opinião', 'Avalie 1 livro hoje', 'Star', 'daily', 'rate_book', 1, 25, 35),
  ('d_comment_1', 'Converse no feed', 'Comente em 1 resenha', 'MessageCircle', 'daily', 'comment_review', 1, 20, 30),
  -- WEEKLY (6)
  ('w_finish_1', 'Termine um livro', 'Conclua a leitura de 1 livro esta semana', 'CheckCircle2', 'weekly', 'finish_book', 1, 100, 80),
  ('w_rate_3', 'Crítico semanal', 'Avalie 3 livros esta semana', 'Stars', 'weekly', 'rate_book', 3, 80, 60),
  ('w_review_1', 'Compartilhe insights', 'Escreva 1 resenha esta semana', 'PenLine', 'weekly', 'write_review', 1, 90, 50),
  ('w_follow_3', 'Expanda sua rede', 'Siga 3 leitores', 'UserPlus', 'weekly', 'follow', 3, 60, 40),
  ('w_scan_5', 'Scanner Master', 'Escaneie 5 livros esta semana', 'ScanBarcode', 'weekly', 'scan_book', 5, 120, 35),
  ('w_club_5', 'Voz no clube', 'Envie 5 mensagens em clubes', 'Users', 'weekly', 'club_message', 5, 70, 30),
  -- EPIC (6) — longa duração (60 dias)
  ('e_finish_10', 'Devorador', 'Conclua 10 livros', 'Library', 'epic', 'finish_book', 10, 500, 100),
  ('e_review_10', 'Crítico Profissional', 'Escreva 10 resenhas', 'Feather', 'epic', 'write_review', 10, 600, 80),
  ('e_loan_3', 'Bibliotecário Generoso', 'Empreste 3 livros', 'HandHeart', 'epic', 'loan_book', 3, 400, 60),
  ('e_scan_50', 'Mestre do Scanner', 'Escaneie 50 livros', 'Camera', 'epic', 'scan_book', 50, 800, 50),
  ('e_follow_25', 'Conector Literário', 'Siga 25 leitores', 'Network', 'epic', 'follow', 25, 350, 40),
  ('e_add_50', 'Acervo Grandioso', 'Tenha 50 livros na biblioteca', 'BookMarked', 'epic', 'add_book', 50, 700, 70)
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  target = EXCLUDED.target,
  xp_reward = EXCLUDED.xp_reward,
  weight = EXCLUDED.weight;

-- 13. Atualizar handle_new_user para criar invite e streak
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  PERFORM public.ensure_invite(NEW.id);
  INSERT INTO public.user_streaks (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

-- 14. Backfill: garantir invites e streaks para usuários existentes
INSERT INTO public.user_streaks (user_id)
  SELECT id FROM public.profiles
  ON CONFLICT (user_id) DO NOTHING;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE id NOT IN (SELECT user_id FROM public.invites) LOOP
    PERFORM public.ensure_invite(r.id);
  END LOOP;
END $$;

-- 15. Recalibrar nível de todos os usuários para a nova curva
UPDATE public.profiles SET level = public.level_for_xp(xp);
