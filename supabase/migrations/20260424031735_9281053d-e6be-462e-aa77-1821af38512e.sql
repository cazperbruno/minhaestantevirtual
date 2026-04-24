-- ============================================================
-- 1) Tabela trade_matches: registra matches detectados
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trade_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  -- usuário que ofereceu o livro pra troca
  offerer_id uuid NOT NULL,
  -- usuário que tem o livro na wishlist
  wisher_id uuid NOT NULL,
  -- quando o match foi detectado
  detected_at timestamptz NOT NULL DEFAULT now(),
  -- quando algum dos dois fez algo a respeito (propôs, dispensou)
  resolved_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','proposed','dismissed','expired')),
  CONSTRAINT no_self_match CHECK (offerer_id <> wisher_id),
  UNIQUE (book_id, offerer_id, wisher_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_matches_offerer ON public.trade_matches(offerer_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_matches_wisher ON public.trade_matches(wisher_id, status, detected_at DESC);

ALTER TABLE public.trade_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trade_matches_select_involved"
  ON public.trade_matches FOR SELECT
  USING (auth.uid() = offerer_id OR auth.uid() = wisher_id);

CREATE POLICY "trade_matches_update_involved"
  ON public.trade_matches FOR UPDATE
  USING (auth.uid() = offerer_id OR auth.uid() = wisher_id);

-- ============================================================
-- 2) Função: detecta matches quando alguém OFERECE um livro pra troca
-- ============================================================
CREATE OR REPLACE FUNCTION public.detect_trade_match_on_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wisher_record RECORD;
  _book_title text;
  _offerer_name text;
  _wisher_name text;
  _match_id uuid;
BEGIN
  -- só age na transição false → true ou em INSERT com true
  IF NEW.available_for_trade IS NOT TRUE THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.available_for_trade IS TRUE THEN RETURN NEW; END IF;

  SELECT title INTO _book_title FROM public.books WHERE id = NEW.book_id;
  SELECT COALESCE(display_name, username, 'Um leitor') INTO _offerer_name
    FROM public.profiles WHERE id = NEW.user_id;

  -- Para cada usuário que tem este livro como wishlist...
  FOR _wisher_record IN
    SELECT ub.user_id
      FROM public.user_books ub
     WHERE ub.book_id = NEW.book_id
       AND ub.status = 'wishlist'
       AND ub.user_id <> NEW.user_id
  LOOP
    -- upsert do match
    INSERT INTO public.trade_matches (book_id, offerer_id, wisher_id, status)
    VALUES (NEW.book_id, NEW.user_id, _wisher_record.user_id, 'pending')
    ON CONFLICT (book_id, offerer_id, wisher_id)
      DO UPDATE SET status = 'pending', detected_at = now(), resolved_at = NULL
    RETURNING id INTO _match_id;

    SELECT COALESCE(display_name, username, 'Alguém') INTO _wisher_name
      FROM public.profiles WHERE id = _wisher_record.user_id;

    -- Notifica quem deseja o livro
    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    VALUES (
      _wisher_record.user_id,
      'trade_match',
      '✨ Match! Alguém tem o livro que você quer',
      _offerer_name || ' está oferecendo "' || COALESCE(_book_title, 'um livro') || '" pra troca',
      '/trocas?match=' || _match_id::text,
      jsonb_build_object('match_id', _match_id, 'book_id', NEW.book_id, 'offerer_id', NEW.user_id, 'role', 'wisher')
    );

    -- Notifica quem ofereceu
    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    VALUES (
      NEW.user_id,
      'trade_match',
      '✨ Match! Alguém quer seu livro',
      _wisher_name || ' tem "' || COALESCE(_book_title, 'esse livro') || '" na lista de desejos',
      '/trocas?match=' || _match_id::text,
      jsonb_build_object('match_id', _match_id, 'book_id', NEW.book_id, 'wisher_id', _wisher_record.user_id, 'role', 'offerer')
    );

    -- Cria atividade pública pro feed (visível pros dois e seguidores)
    INSERT INTO public.activities (user_id, kind, book_id, target_user_id, is_public, meta)
    VALUES (
      NEW.user_id,
      'trade_match',
      NEW.book_id,
      _wisher_record.user_id,
      true,
      jsonb_build_object('match_id', _match_id, 'wisher_name', _wisher_name)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3) Função: detecta matches quando alguém ADICIONA livro à WISHLIST
-- ============================================================
CREATE OR REPLACE FUNCTION public.detect_trade_match_on_wish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _offerer_record RECORD;
  _book_title text;
  _offerer_name text;
  _wisher_name text;
  _match_id uuid;
BEGIN
  IF NEW.status <> 'wishlist' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'wishlist' THEN RETURN NEW; END IF;

  SELECT title INTO _book_title FROM public.books WHERE id = NEW.book_id;
  SELECT COALESCE(display_name, username, 'Um leitor') INTO _wisher_name
    FROM public.profiles WHERE id = NEW.user_id;

  FOR _offerer_record IN
    SELECT ub.user_id
      FROM public.user_books ub
     WHERE ub.book_id = NEW.book_id
       AND ub.available_for_trade = true
       AND ub.user_id <> NEW.user_id
  LOOP
    INSERT INTO public.trade_matches (book_id, offerer_id, wisher_id, status)
    VALUES (NEW.book_id, _offerer_record.user_id, NEW.user_id, 'pending')
    ON CONFLICT (book_id, offerer_id, wisher_id)
      DO UPDATE SET status = 'pending', detected_at = now(), resolved_at = NULL
    RETURNING id INTO _match_id;

    SELECT COALESCE(display_name, username, 'Alguém') INTO _offerer_name
      FROM public.profiles WHERE id = _offerer_record.user_id;

    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    VALUES (
      NEW.user_id,
      'trade_match',
      '✨ Match! Alguém tem o livro que você quer',
      _offerer_name || ' está oferecendo "' || COALESCE(_book_title, 'um livro') || '" pra troca',
      '/trocas?match=' || _match_id::text,
      jsonb_build_object('match_id', _match_id, 'book_id', NEW.book_id, 'offerer_id', _offerer_record.user_id, 'role', 'wisher')
    );

    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    VALUES (
      _offerer_record.user_id,
      'trade_match',
      '✨ Match! Alguém quer seu livro',
      _wisher_name || ' acaba de adicionar "' || COALESCE(_book_title, 'esse livro') || '" à lista de desejos',
      '/trocas?match=' || _match_id::text,
      jsonb_build_object('match_id', _match_id, 'book_id', NEW.book_id, 'wisher_id', NEW.user_id, 'role', 'offerer')
    );

    INSERT INTO public.activities (user_id, kind, book_id, target_user_id, is_public, meta)
    VALUES (
      _offerer_record.user_id,
      'trade_match',
      NEW.book_id,
      NEW.user_id,
      true,
      jsonb_build_object('match_id', _match_id, 'wisher_name', _wisher_name)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 4) Triggers nas tabelas
-- ============================================================
DROP TRIGGER IF EXISTS trg_trade_match_on_offer ON public.user_books;
CREATE TRIGGER trg_trade_match_on_offer
  AFTER INSERT OR UPDATE OF available_for_trade ON public.user_books
  FOR EACH ROW EXECUTE FUNCTION public.detect_trade_match_on_offer();

DROP TRIGGER IF EXISTS trg_trade_match_on_wish ON public.user_books;
CREATE TRIGGER trg_trade_match_on_wish
  AFTER INSERT OR UPDATE OF status ON public.user_books
  FOR EACH ROW EXECUTE FUNCTION public.detect_trade_match_on_wish();

-- ============================================================
-- 5) Atividade extra: book_available_for_trade e wishlist_added
-- emitidas via trigger pra aparecer no feed social
-- ============================================================
CREATE OR REPLACE FUNCTION public.emit_user_book_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Disponível pra troca: false → true
  IF (TG_OP = 'INSERT' AND NEW.available_for_trade IS TRUE)
     OR (TG_OP = 'UPDATE' AND COALESCE(OLD.available_for_trade,false) = false AND NEW.available_for_trade = true) THEN
    INSERT INTO public.activities (user_id, kind, book_id, is_public, meta)
    VALUES (NEW.user_id, 'book_available_for_trade', NEW.book_id, true, '{}'::jsonb);
  END IF;

  -- Wishlist (adicionou aos desejos)
  IF (TG_OP = 'INSERT' AND NEW.status = 'wishlist')
     OR (TG_OP = 'UPDATE' AND COALESCE(OLD.status,'') <> 'wishlist' AND NEW.status = 'wishlist') THEN
    INSERT INTO public.activities (user_id, kind, book_id, is_public, meta)
    VALUES (NEW.user_id, 'wishlist_added', NEW.book_id, true, '{}'::jsonb);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_user_book_activity ON public.user_books;
CREATE TRIGGER trg_emit_user_book_activity
  AFTER INSERT OR UPDATE ON public.user_books
  FOR EACH ROW EXECUTE FUNCTION public.emit_user_book_activity();