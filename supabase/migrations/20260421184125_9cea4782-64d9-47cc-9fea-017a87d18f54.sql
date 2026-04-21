-- Mescla séries duplicadas e re-vincula livros órfãos
-- Caso 1: BOA NOITE PUNPUN duplicada — move volume 3 para a série principal e remove a duplicata
DO $$
DECLARE
  canonical_id uuid := '7611f0b5-c7da-4a4f-ac08-5131f3e81d02';
  duplicate_id uuid := 'fd96f1d6-9105-47eb-bd75-67ba51bb5d28';
BEGIN
  -- Move livros da série duplicada para a canônica
  UPDATE public.books
  SET series_id = canonical_id
  WHERE series_id = duplicate_id;

  -- Remove a série duplicada
  DELETE FROM public.series WHERE id = duplicate_id;
END $$;

-- Caso 2: vincular Jojo's Steel Ball Run #6 e similares — cria série e linka
-- (livro órfão sem autor mas com padrão de volume claro)
DO $$
DECLARE
  jojo_series_id uuid;
BEGIN
  -- Cria série se não existir
  SELECT id INTO jojo_series_id
  FROM public.series
  WHERE LOWER(title) = 'jojo''s steel ball run' AND content_type = 'manga'
  LIMIT 1;

  IF jojo_series_id IS NULL THEN
    INSERT INTO public.series (title, authors, content_type, source, source_id)
    VALUES ('Jojo''s Steel Ball Run', ARRAY['Hirohiko Araki']::text[], 'manga', 'manual-fix', 'jojos-steel-ball-run')
    RETURNING id INTO jojo_series_id;
  END IF;

  -- Linka o volume órfão
  UPDATE public.books
  SET series_id = jojo_series_id, volume_number = 6
  WHERE id = 'ab504a5f-48d0-427c-8bee-9eac012d3179';
END $$;

-- Garante que volume_number esteja correto em livros já linkados (extrai do título se NULL)
-- Função auxiliar para extrair número de volume — espelha série-normalize do front
CREATE OR REPLACE FUNCTION public.extract_volume_number(title text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  m text[];
  n integer;
BEGIN
  IF title IS NULL THEN RETURN NULL; END IF;
  -- Tenta capturar "vol. N", "volume N", "tomo N", "#N", "n. N"
  m := regexp_match(LOWER(title), '(?:vol(?:ume|\.+)?|tomo|tome|cap\.*|n[º°o]?\.*|#)\s*(\d{1,3})(?!\d)');
  IF m IS NOT NULL THEN
    BEGIN
      n := (m[1])::integer;
      RETURN n;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END IF;
  RETURN NULL;
END;
$$;

-- Backfill: livros vinculados a séries mas sem volume_number — extrai do título
UPDATE public.books
SET volume_number = public.extract_volume_number(title)
WHERE series_id IS NOT NULL
  AND volume_number IS NULL
  AND public.extract_volume_number(title) IS NOT NULL;