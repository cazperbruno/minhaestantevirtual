-- =======================================================================
-- BOOK RECOMMENDATIONS — feature social completa
-- =======================================================================

-- 1) TABELA PRINCIPAL
CREATE TABLE IF NOT EXISTS public.book_recommendations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  book_id         uuid NOT NULL,
  message         text,
  is_public       boolean NOT NULL DEFAULT true,
  likes_count     integer NOT NULL DEFAULT 0,
  comments_count  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recs_message_len CHECK (message IS NULL OR length(message) <= 500)
);
CREATE INDEX IF NOT EXISTS idx_recs_user_created ON public.book_recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recs_book_created ON public.book_recommendations(book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recs_public_created ON public.book_recommendations(is_public, created_at DESC) WHERE is_public = true;

-- 2) DESTINATÁRIOS (para recs privadas)
CREATE TABLE IF NOT EXISTS public.recommendation_recipients (
  recommendation_id uuid NOT NULL REFERENCES public.book_recommendations(id) ON DELETE CASCADE,
  recipient_id      uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recommendation_id, recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_rec_recipients_user ON public.recommendation_recipients(recipient_id);

-- 3) LIKES
CREATE TABLE IF NOT EXISTS public.recommendation_likes (
  recommendation_id uuid NOT NULL REFERENCES public.book_recommendations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recommendation_id, user_id)
);

-- 4) COMENTÁRIOS
CREATE TABLE IF NOT EXISTS public.recommendation_comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES public.book_recommendations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,
  content           text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rec_comments_content_len CHECK (length(content) BETWEEN 1 AND 1000)
);
CREATE INDEX IF NOT EXISTS idx_rec_comments_rec ON public.recommendation_comments(recommendation_id, created_at);

-- =======================================================================
-- TRIGGERS DE CONTAGEM + UPDATED_AT
-- =======================================================================
CREATE OR REPLACE FUNCTION public.update_recommendation_likes_count()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.book_recommendations SET likes_count = likes_count + 1 WHERE id = NEW.recommendation_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.book_recommendations SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.recommendation_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_rec_likes_count ON public.recommendation_likes;
CREATE TRIGGER trg_rec_likes_count
AFTER INSERT OR DELETE ON public.recommendation_likes
FOR EACH ROW EXECUTE FUNCTION public.update_recommendation_likes_count();

CREATE OR REPLACE FUNCTION public.update_recommendation_comments_count()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.book_recommendations SET comments_count = comments_count + 1 WHERE id = NEW.recommendation_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.book_recommendations SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.recommendation_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_rec_comments_count ON public.recommendation_comments;
CREATE TRIGGER trg_rec_comments_count
AFTER INSERT OR DELETE ON public.recommendation_comments
FOR EACH ROW EXECUTE FUNCTION public.update_recommendation_comments_count();

DROP TRIGGER IF EXISTS trg_recs_updated_at ON public.book_recommendations;
CREATE TRIGGER trg_recs_updated_at
BEFORE UPDATE ON public.book_recommendations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =======================================================================
-- RLS
-- =======================================================================
ALTER TABLE public.book_recommendations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_recipients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_likes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_comments      ENABLE ROW LEVEL SECURITY;

-- Helper: é destinatário de uma rec
CREATE OR REPLACE FUNCTION public.is_rec_recipient(_rec_id uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recommendation_recipients
    WHERE recommendation_id = _rec_id AND recipient_id = _user
  );
$$;

-- recommendations
CREATE POLICY "recs_select_visible" ON public.book_recommendations
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR is_public = true
    OR public.is_rec_recipient(id, auth.uid())
  );

CREATE POLICY "recs_insert_own" ON public.book_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "recs_update_own" ON public.book_recommendations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "recs_delete_own" ON public.book_recommendations
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- recipients (visíveis apenas ao autor da rec ou ao próprio destinatário)
CREATE POLICY "rec_recipients_select" ON public.recommendation_recipients
  FOR SELECT TO authenticated
  USING (
    auth.uid() = recipient_id
    OR EXISTS (SELECT 1 FROM public.book_recommendations r WHERE r.id = recommendation_id AND r.user_id = auth.uid())
  );
-- Inserts vêm via função SECURITY DEFINER (recommend_book) — nada de insert direto de cliente.

-- likes
CREATE POLICY "rec_likes_select_all" ON public.recommendation_likes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "rec_likes_insert_self" ON public.recommendation_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.book_recommendations r
      WHERE r.id = recommendation_id
        AND (r.is_public = true OR r.user_id = auth.uid() OR public.is_rec_recipient(r.id, auth.uid()))
    )
  );
CREATE POLICY "rec_likes_delete_self" ON public.recommendation_likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- comments
CREATE POLICY "rec_comments_select_visible" ON public.recommendation_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.book_recommendations r
      WHERE r.id = recommendation_id
        AND (r.is_public = true OR r.user_id = auth.uid() OR public.is_rec_recipient(r.id, auth.uid()))
    )
  );
CREATE POLICY "rec_comments_insert_self" ON public.recommendation_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.book_recommendations r
      WHERE r.id = recommendation_id
        AND (r.is_public = true OR r.user_id = auth.uid() OR public.is_rec_recipient(r.id, auth.uid()))
    )
  );
CREATE POLICY "rec_comments_delete_own" ON public.recommendation_comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =======================================================================
-- RPC PRINCIPAL: cria recomendação (valida + XP + notificações)
-- =======================================================================
CREATE OR REPLACE FUNCTION public.recommend_book(
  _book_id      uuid,
  _is_public    boolean,
  _message      text,
  _recipient_ids uuid[]
)
RETURNS TABLE(success boolean, recommendation_id uuid, xp_granted integer, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rec_id uuid;
  v_today_count int;
  v_xp int := 0;
  v_book_title text;
  v_actor_name text;
  rid uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 0, 'unauthenticated'::text; RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.books WHERE id = _book_id) THEN
    RETURN QUERY SELECT false, NULL::uuid, 0, 'invalid_book'::text; RETURN;
  END IF;

  IF _is_public = false AND (_recipient_ids IS NULL OR array_length(_recipient_ids, 1) IS NULL) THEN
    RETURN QUERY SELECT false, NULL::uuid, 0, 'no_recipients'::text; RETURN;
  END IF;

  IF _is_public = false AND array_length(_recipient_ids, 1) > 20 THEN
    RETURN QUERY SELECT false, NULL::uuid, 0, 'too_many_recipients'::text; RETURN;
  END IF;

  -- Cap de XP: 5 recs com bônus por dia (extras ainda criam, mas sem XP)
  SELECT COUNT(*) INTO v_today_count
  FROM public.book_recommendations
  WHERE user_id = v_uid AND created_at >= date_trunc('day', now());

  IF v_today_count < 5 THEN
    v_xp := 5;
  END IF;

  INSERT INTO public.book_recommendations (user_id, book_id, message, is_public)
  VALUES (v_uid, _book_id, NULLIF(trim(_message), ''), _is_public)
  RETURNING id INTO v_rec_id;

  -- Destinatários (privadas)
  IF _is_public = false THEN
    INSERT INTO public.recommendation_recipients (recommendation_id, recipient_id)
    SELECT v_rec_id, unnest(_recipient_ids)
    ON CONFLICT DO NOTHING;
  END IF;

  -- XP
  IF v_xp > 0 THEN
    PERFORM public.add_xp(v_uid, v_xp, 'recommend_book', jsonb_build_object('rec_id', v_rec_id, 'book_id', _book_id));
  END IF;

  -- Notificações para destinatários (privada) ou nada (pública vai pelo feed)
  IF _is_public = false THEN
    SELECT title INTO v_book_title FROM public.books WHERE id = _book_id;
    SELECT COALESCE(display_name, username, 'Alguém') INTO v_actor_name FROM public.profiles WHERE id = v_uid;

    FOREACH rid IN ARRAY _recipient_ids LOOP
      IF rid <> v_uid THEN
        INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
        VALUES (
          rid,
          'book_recommendation',
          v_actor_name || ' recomendou um livro pra você',
          COALESCE('"' || v_book_title || '"', 'Veja a recomendação'),
          '/livro/' || _book_id::text,
          jsonb_build_object('rec_id', v_rec_id, 'book_id', _book_id, 'from_user', v_uid)
        );
      END IF;
    END LOOP;
  END IF;

  -- Atividade pública para o feed (somente públicas)
  IF _is_public = true THEN
    INSERT INTO public.activities (user_id, kind, book_id, is_public, meta)
    VALUES (v_uid, 'book_recommended', _book_id, true,
            jsonb_build_object('rec_id', v_rec_id));
  END IF;

  RETURN QUERY SELECT true, v_rec_id, v_xp, 'ok'::text;
END $$;

-- Realtime para curtir/comentar/criar
ALTER PUBLICATION supabase_realtime ADD TABLE public.book_recommendations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recommendation_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recommendation_comments;