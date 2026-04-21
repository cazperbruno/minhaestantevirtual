
-- =========================================================
-- 1) BLOQUEAR ESCRITA EM user_roles (anti-escalonamento)
-- =========================================================
DROP POLICY IF EXISTS "user_roles_insert_self" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_self" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_delete_self" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_no_insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_no_update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_no_delete" ON public.user_roles;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Apenas SELECT do próprio usuário ou admin
DROP POLICY IF EXISTS "user_roles_select_own_or_admin" ON public.user_roles;
CREATE POLICY "user_roles_select_own_or_admin"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- Bloqueio total de escrita pelo cliente
CREATE POLICY "user_roles_no_insert"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "user_roles_no_update"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "user_roles_no_delete"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (false);

-- =========================================================
-- 2) MOVER notes PARA TABELA PRIVADA
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_book_notes (
  user_book_id uuid PRIMARY KEY REFERENCES public.user_books(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_book_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ubn_select_own" ON public.user_book_notes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ubn_insert_own" ON public.user_book_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ubn_update_own" ON public.user_book_notes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ubn_delete_own" ON public.user_book_notes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Migrar dados existentes
INSERT INTO public.user_book_notes (user_book_id, user_id, notes)
SELECT id, user_id, notes
FROM public.user_books
WHERE notes IS NOT NULL AND length(trim(notes)) > 0
ON CONFLICT (user_book_id) DO NOTHING;

-- Trigger para sincronizar updated_at
CREATE OR REPLACE FUNCTION public.touch_user_book_notes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ubn ON public.user_book_notes;
CREATE TRIGGER trg_touch_ubn
  BEFORE UPDATE ON public.user_book_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_book_notes();

-- Endurecer SELECT em user_books: notes só aparece para o dono via política em coluna não é trivial em PG;
-- mantemos a coluna mas bloqueamos uso público recomendando o app ler de user_book_notes.
-- Removemos notes de leituras públicas via reescrita no client (ver código).
-- Aqui zeramos notes em registros públicos para garantir privacidade retroativa.
UPDATE public.user_books
SET notes = NULL
WHERE notes IS NOT NULL;

-- =========================================================
-- 3) OCULTAR borrower_name DO FEED PÚBLICO
-- =========================================================
-- A política atual de activities permite SELECT público quando is_public=true.
-- Vamos remover meta->>'borrower_name' do payload exposto criando uma view sanitizada
-- e endurecer a política para que registros 'book_lent' só sejam visíveis ao dono.

DROP POLICY IF EXISTS "activities_select_visible" ON public.activities;
CREATE POLICY "activities_select_visible"
  ON public.activities FOR SELECT
  TO public
  USING (
    auth.uid() = user_id
    OR (
      is_public = true
      AND kind <> 'book_lent'
      AND COALESCE(
        (SELECT profiles.profile_visibility FROM public.profiles WHERE profiles.id = activities.user_id),
        'public'
      ) = 'public'
    )
  );

-- =========================================================
-- 4) STORIES RESPEITAM profile_visibility
-- =========================================================
DROP POLICY IF EXISTS "Stories são públicas e visíveis enquanto ativas" ON public.stories;

CREATE POLICY "stories_select_respect_visibility"
  ON public.stories FOR SELECT
  TO public
  USING (
    expires_at > now()
    AND (
      auth.uid() = user_id
      OR COALESCE(
        (SELECT profiles.profile_visibility FROM public.profiles WHERE profiles.id = stories.user_id),
        'public'
      ) = 'public'
    )
  );

-- =========================================================
-- 5) POLICIES EM recommendation_recipients
-- =========================================================
DROP POLICY IF EXISTS "rec_recipients_insert_owner" ON public.recommendation_recipients;
DROP POLICY IF EXISTS "rec_recipients_delete_owner" ON public.recommendation_recipients;

CREATE POLICY "rec_recipients_insert_owner"
  ON public.recommendation_recipients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.book_recommendations r
      WHERE r.id = recommendation_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "rec_recipients_delete_owner"
  ON public.recommendation_recipients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.book_recommendations r
      WHERE r.id = recommendation_id AND r.user_id = auth.uid()
    )
  );

-- =========================================================
-- 6) TRIGGER AUTOMÁTICO DE SÉRIES
-- =========================================================
CREATE OR REPLACE FUNCTION public.auto_link_book_to_series()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parsed record;
  v_series_id uuid;
  v_clean_title text;
BEGIN
  -- Só processa se ainda não tem série e tem título
  IF NEW.series_id IS NOT NULL OR NEW.title IS NULL THEN
    RETURN NEW;
  END IF;

  -- Usa parser existente
  SELECT series_title, volume_num INTO v_parsed
  FROM public.parse_series_title(NEW.title)
  LIMIT 1;

  IF v_parsed.series_title IS NULL OR v_parsed.volume_num IS NULL THEN
    RETURN NEW;
  END IF;

  v_clean_title := trim(v_parsed.series_title);
  IF length(v_clean_title) < 2 THEN
    RETURN NEW;
  END IF;

  -- Busca série existente pelo título + content_type
  SELECT id INTO v_series_id
  FROM public.series
  WHERE lower(title) = lower(v_clean_title)
    AND content_type = NEW.content_type
  LIMIT 1;

  -- Cria se não existir
  IF v_series_id IS NULL THEN
    INSERT INTO public.series (title, content_type, authors, cover_url, source)
    VALUES (
      v_clean_title,
      NEW.content_type,
      COALESCE(NEW.authors, '{}'::text[]),
      NEW.cover_url,
      'auto'
    )
    RETURNING id INTO v_series_id;
  END IF;

  NEW.series_id := v_series_id;
  IF NEW.volume_number IS NULL THEN
    NEW.volume_number := v_parsed.volume_num;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_series ON public.books;
CREATE TRIGGER trg_auto_link_series
  BEFORE INSERT OR UPDATE OF title ON public.books
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_book_to_series();

-- Backfill: aplicar para livros existentes sem série
UPDATE public.books
SET title = title  -- dispara trigger BEFORE UPDATE
WHERE series_id IS NULL
  AND title IS NOT NULL
  AND (
    title ~* '\m(vol(ume)?\.?\s*\d+|#\d+|tomo\s*\d+|n[°º]\s*\d+)'
  );
