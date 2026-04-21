
-- =========================================================
-- 1) Função utilitária: normalizar título e extrair volume
-- =========================================================
CREATE OR REPLACE FUNCTION public.parse_series_title(_title TEXT)
RETURNS TABLE(series_title TEXT, volume_num INTEGER)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  t TEXT := COALESCE(_title, '');
  m TEXT;
  vol INTEGER := NULL;
  base TEXT;
BEGIN
  -- Pattern 1: "... Vol. 5" / "... Volume 5" / "... vol 5" / "... v.5"
  m := substring(t FROM '(?i)\m(?:vol(?:ume)?|v)\.?\s*([0-9]+)\M');
  IF m IS NOT NULL THEN
    vol := m::INT;
    base := regexp_replace(t, '(?i)\s*[-–—]?\s*\m(?:vol(?:ume)?|v)\.?\s*[0-9]+.*$', '', 'g');
  ELSE
    -- Pattern 2: "... #5" / "... Nº 5" / "... No. 5"
    m := substring(t FROM '(?i)(?:#|n[ºo°]\.?\s*)([0-9]+)\M');
    IF m IS NOT NULL THEN
      vol := m::INT;
      base := regexp_replace(t, '(?i)\s*[-–—]?\s*(?:#|n[ºo°]\.?\s*)[0-9]+.*$', '', 'g');
    ELSE
      -- Pattern 3: trailing standalone number "Naruto 5" (only if length > 1 word before)
      m := substring(t FROM '\s([0-9]{1,3})\s*$');
      IF m IS NOT NULL AND length(trim(regexp_replace(t, '\s[0-9]{1,3}\s*$', ''))) > 2 THEN
        vol := m::INT;
        base := regexp_replace(t, '\s+[0-9]{1,3}\s*$', '');
      ELSE
        base := t;
      END IF;
    END IF;
  END IF;

  -- Cleanup base
  base := regexp_replace(base, '\s*[-–—:]\s*$', '');
  base := regexp_replace(base, '\s+', ' ', 'g');
  base := trim(base);

  series_title := base;
  volume_num := vol;
  RETURN NEXT;
END;
$$;

-- =========================================================
-- 2) Trigger: auto-agrupar volumes em séries
-- =========================================================
CREATE OR REPLACE FUNCTION public.auto_group_series()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parsed RECORD;
  existing_series_id UUID;
  primary_author TEXT;
BEGIN
  -- Só processa mangás/HQs sem série definida
  IF NEW.series_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.content_type NOT IN ('manga', 'comic') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO parsed FROM public.parse_series_title(NEW.title);

  -- Sem volume detectado e título tem só 1 palavra → não agrupa
  IF parsed.volume_num IS NULL AND array_length(string_to_array(parsed.series_title, ' '), 1) < 1 THEN
    RETURN NEW;
  END IF;

  primary_author := COALESCE(NEW.authors[1], '');

  -- Se temos um volume, definir o número
  IF parsed.volume_num IS NOT NULL AND NEW.volume_number IS NULL THEN
    NEW.volume_number := parsed.volume_num;
  END IF;

  -- Tentar achar série existente: mesmo content_type + título base similar + autor primário
  SELECT s.id INTO existing_series_id
  FROM public.series s
  WHERE s.content_type = NEW.content_type
    AND lower(s.title) = lower(parsed.series_title)
    AND (
      array_length(s.authors, 1) IS NULL OR primary_author = '' OR
      lower(s.authors[1]) = lower(primary_author)
    )
  LIMIT 1;

  IF existing_series_id IS NULL AND parsed.volume_num IS NOT NULL THEN
    -- Criar nova série
    INSERT INTO public.series (title, authors, content_type, cover_url, source)
    VALUES (
      parsed.series_title,
      CASE WHEN primary_author = '' THEN '{}'::TEXT[] ELSE ARRAY[primary_author] END,
      NEW.content_type,
      NEW.cover_url,
      'auto-detected'
    )
    RETURNING id INTO existing_series_id;
  END IF;

  IF existing_series_id IS NOT NULL THEN
    NEW.series_id := existing_series_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_group_series ON public.books;
CREATE TRIGGER trg_auto_group_series
  BEFORE INSERT OR UPDATE OF title, content_type ON public.books
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_group_series();

-- =========================================================
-- 3) Backfill: agrupar livros existentes
-- =========================================================
DO $$
DECLARE
  r RECORD;
  parsed RECORD;
  existing_id UUID;
  primary_author TEXT;
BEGIN
  FOR r IN
    SELECT id, title, authors, content_type, cover_url, volume_number
    FROM public.books
    WHERE series_id IS NULL AND content_type IN ('manga', 'comic')
  LOOP
    SELECT * INTO parsed FROM public.parse_series_title(r.title);
    IF parsed.volume_num IS NULL THEN
      CONTINUE;
    END IF;
    primary_author := COALESCE(r.authors[1], '');

    SELECT s.id INTO existing_id
    FROM public.series s
    WHERE s.content_type = r.content_type
      AND lower(s.title) = lower(parsed.series_title)
      AND (array_length(s.authors, 1) IS NULL OR primary_author = '' OR lower(s.authors[1]) = lower(primary_author))
    LIMIT 1;

    IF existing_id IS NULL THEN
      INSERT INTO public.series (title, authors, content_type, cover_url, source)
      VALUES (
        parsed.series_title,
        CASE WHEN primary_author = '' THEN '{}'::TEXT[] ELSE ARRAY[primary_author] END,
        r.content_type,
        r.cover_url,
        'auto-detected'
      ) RETURNING id INTO existing_id;
    END IF;

    UPDATE public.books
    SET series_id = existing_id,
        volume_number = COALESCE(volume_number, parsed.volume_num)
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- =========================================================
-- 4) Ranking colecionador (séries mais completas globalmente)
-- =========================================================
CREATE OR REPLACE FUNCTION public.series_collection_ranking(_limit INT DEFAULT 50)
RETURNS TABLE(
  series_id UUID,
  title TEXT,
  cover_url TEXT,
  content_type content_type,
  total_volumes INTEGER,
  collectors INTEGER,
  avg_completion NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_progress AS (
    SELECT
      b.series_id,
      ub.user_id,
      COUNT(*) FILTER (WHERE ub.status = 'read') AS read_cnt,
      COUNT(*) AS owned_cnt
    FROM public.user_books ub
    JOIN public.books b ON b.id = ub.book_id
    WHERE b.series_id IS NOT NULL
    GROUP BY b.series_id, ub.user_id
  )
  SELECT
    s.id AS series_id,
    s.title,
    s.cover_url,
    s.content_type,
    COALESCE(s.total_volumes, (SELECT COUNT(*)::INT FROM public.books bb WHERE bb.series_id = s.id)) AS total_volumes,
    COUNT(DISTINCT up.user_id)::INT AS collectors,
    ROUND(AVG(
      CASE
        WHEN COALESCE(s.total_volumes, 0) > 0
          THEN LEAST(100, (up.read_cnt::NUMERIC / s.total_volumes) * 100)
        ELSE LEAST(100, (up.read_cnt::NUMERIC / NULLIF(up.owned_cnt, 0)) * 100)
      END
    ), 1) AS avg_completion
  FROM public.series s
  JOIN user_progress up ON up.series_id = s.id
  GROUP BY s.id
  HAVING COUNT(DISTINCT up.user_id) >= 1
  ORDER BY avg_completion DESC NULLS LAST, collectors DESC
  LIMIT _limit;
$$;

-- =========================================================
-- 5) Notificação inteligente: "faltam X volumes"
-- =========================================================
CREATE OR REPLACE FUNCTION public.notify_series_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s_id UUID;
  s_title TEXT;
  s_total INTEGER;
  read_cnt INTEGER;
  missing INTEGER;
  already_notified BOOLEAN;
BEGIN
  IF NEW.status <> 'read' OR (TG_OP = 'UPDATE' AND OLD.status = 'read') THEN
    RETURN NEW;
  END IF;

  SELECT b.series_id INTO s_id FROM public.books b WHERE b.id = NEW.book_id;
  IF s_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.title, s.total_volumes INTO s_title, s_total
  FROM public.series s WHERE s.id = s_id;

  IF s_total IS NULL OR s_total < 3 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO read_cnt
  FROM public.user_books ub
  JOIN public.books b ON b.id = ub.book_id
  WHERE ub.user_id = NEW.user_id AND b.series_id = s_id AND ub.status = 'read';

  missing := s_total - read_cnt;

  IF missing IN (1, 2) THEN
    -- evitar spam: 1 notif por série/dia
    SELECT EXISTS(
      SELECT 1 FROM public.notifications
      WHERE user_id = NEW.user_id
        AND kind = 'series_almost_complete'
        AND meta->>'series_id' = s_id::TEXT
        AND created_at > now() - interval '24 hours'
    ) INTO already_notified;

    IF NOT already_notified THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
      VALUES (
        NEW.user_id,
        'series_almost_complete',
        CASE WHEN missing = 1 THEN '🔥 Falta apenas 1 volume!' ELSE '🎯 Você está quase lá!' END,
        format('Faltam %s volume(s) para completar %s', missing, s_title),
        '/serie/' || s_id::TEXT,
        jsonb_build_object('series_id', s_id, 'missing', missing, 'series_title', s_title)
      );
    END IF;
  ELSIF missing = 0 THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    VALUES (
      NEW.user_id,
      'series_complete',
      '🏆 Série completa!',
      format('Você completou %s — parabéns, colecionador!', s_title),
      '/serie/' || s_id::TEXT,
      jsonb_build_object('series_id', s_id, 'series_title', s_title)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_series_progress ON public.user_books;
CREATE TRIGGER trg_notify_series_progress
  AFTER INSERT OR UPDATE OF status ON public.user_books
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_series_progress();

-- =========================================================
-- 6) Novas conquistas de coleção
-- =========================================================
INSERT INTO public.achievements (code, title, description, icon, category, xp_reward, threshold)
VALUES
  ('first_series', 'Colecionador iniciante', 'Comece a acompanhar sua primeira série', 'Layers', 'collection', 30, 1),
  ('series_half_done', 'Meio caminho andado', 'Complete 50% de uma série', 'Target', 'collection', 60, 50),
  ('series_complete', 'Coleção completa', 'Complete uma série inteira', 'Trophy', 'collection', 150, 100),
  ('series_master', 'Mestre colecionador', 'Complete 5 séries diferentes', 'Crown', 'collection', 500, 5)
ON CONFLICT (code) DO NOTHING;
