
-- 1) Adicionar categoria 'tecnicos' (Técnicos / Acadêmicos) ao enum club_category
-- Postgres não permite ALTER TYPE ... ADD VALUE em transação se já existe; uso DO/IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'club_category' AND e.enumlabel = 'tecnicos'
  ) THEN
    ALTER TYPE public.club_category ADD VALUE 'tecnicos';
  END IF;
END $$;

-- 2) Reescreve open_daily_surprise_box com defesa robusta:
--    a) NÃO falha se não houver livro elegível (book_id pode ser NULL)
--    b) trata exceptions de add_xp/recommend_for_user (não bloqueia o claim)
--    c) PRIORIZA livros em PT-BR no sorteio (3x mais peso)
CREATE OR REPLACE FUNCTION public.open_daily_surprise_box()
RETURNS TABLE(book_id uuid, bonus_xp integer, rarity text, already_claimed boolean, claim_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _now_brt timestamptz := now() AT TIME ZONE 'America/Sao_Paulo';
  _today date := _now_brt::date;
  _is_saturday boolean := EXTRACT(DOW FROM _now_brt) = 6;
  _existing public.daily_surprise_claims%ROWTYPE;
  _picked_book uuid;
  _roll numeric;
  _rarity text;
  _bonus int;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO _existing
  FROM public.daily_surprise_claims
  WHERE user_id = _user_id AND claim_date = _today;

  IF FOUND THEN
    RETURN QUERY SELECT _existing.book_id, _existing.bonus_xp, _existing.rarity, TRUE, _existing.claim_date;
    RETURN;
  END IF;

  -- Pool: top recomendado (com tratamento de erro para o caso de recommend_for_user falhar)
  BEGIN
    SELECT r.id INTO _picked_book
    FROM public.recommend_for_user(_user_id, 30) r
    JOIN public.books b ON b.id = r.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_books ub
      WHERE ub.user_id = _user_id AND ub.book_id = r.id
    )
    ORDER BY
      -- PT-BR ganha prioridade no sorteio (peso 3x via -ln(random)/peso)
      CASE WHEN COALESCE(b.language, '') ILIKE 'pt%' THEN -ln(GREATEST(random(), 0.001)) / 3.0
           ELSE -ln(GREATEST(random(), 0.001)) END
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _picked_book := NULL;
  END;

  -- Fallback: aleatório com cover, priorizando PT-BR
  IF _picked_book IS NULL THEN
    SELECT b.id INTO _picked_book
    FROM public.books b
    WHERE b.cover_url IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_books ub
        WHERE ub.user_id = _user_id AND ub.book_id = b.id
      )
    ORDER BY
      CASE WHEN COALESCE(b.language, '') ILIKE 'pt%' THEN -ln(GREATEST(random(), 0.001)) / 3.0
           ELSE -ln(GREATEST(random(), 0.001)) END
    LIMIT 1;
  END IF;

  -- Rolagem de raridade
  _roll := random();
  IF _is_saturday THEN
    IF _roll < 0.35 THEN _rarity := 'common';   _bonus := 10;
    ELSIF _roll < 0.65 THEN _rarity := 'rare';     _bonus := 25;
    ELSIF _roll < 0.90 THEN _rarity := 'epic';     _bonus := 60;
    ELSE _rarity := 'legendary'; _bonus := 150;
    END IF;
  ELSE
    IF _roll < 0.60 THEN _rarity := 'common';   _bonus := 5;
    ELSIF _roll < 0.85 THEN _rarity := 'rare';     _bonus := 15;
    ELSIF _roll < 0.97 THEN _rarity := 'epic';     _bonus := 40;
    ELSE _rarity := 'legendary'; _bonus := 100;
    END IF;
  END IF;

  -- Persiste claim (book_id pode ser NULL — caixa ainda paga XP)
  INSERT INTO public.daily_surprise_claims (user_id, claim_date, book_id, bonus_xp, rarity)
  VALUES (_user_id, _today, _picked_book, _bonus, _rarity);

  -- XP bonus (não bloqueia se add_xp falhar)
  BEGIN
    PERFORM public.add_xp(
      _user_id, _bonus, 'misc',
      jsonb_build_object('source', 'daily_box', 'rarity', _rarity, 'saturday_boost', _is_saturday)
    );
  EXCEPTION WHEN OTHERS THEN
    -- ignora; o claim já foi gravado
    NULL;
  END;

  RETURN QUERY SELECT _picked_book, _bonus, _rarity, FALSE, _today;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_daily_surprise_box() TO authenticated;
