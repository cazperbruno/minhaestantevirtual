-- Função de validação de integridade das séries.
-- Retorna apenas séries que têm pelo menos uma inconsistência.
CREATE OR REPLACE FUNCTION public.validate_series_integrity()
RETURNS TABLE (
  series_id uuid,
  series_title text,
  content_type content_type,
  total_volumes integer,
  books_count integer,
  numbered_count integer,
  unnumbered_count integer,
  min_volume integer,
  max_volume integer,
  missing_volumes integer[],
  duplicate_volumes integer[],
  has_gaps boolean,
  has_duplicates boolean,
  has_unnumbered boolean,
  is_complete boolean,
  severity text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      s.id AS sid,
      s.title AS stitle,
      s.content_type AS sct,
      s.total_volumes AS stotal,
      b.id AS bid,
      b.volume_number AS vol
    FROM public.series s
    LEFT JOIN public.books b ON b.series_id = s.id
  ),
  agg AS (
    SELECT
      sid,
      stitle,
      sct,
      stotal,
      COUNT(bid)::int AS books_count,
      COUNT(vol)::int AS numbered_count,
      (COUNT(bid) - COUNT(vol))::int AS unnumbered_count,
      MIN(vol)::int AS min_v,
      MAX(vol)::int AS max_v,
      array_agg(vol ORDER BY vol) FILTER (WHERE vol IS NOT NULL) AS vols
    FROM base
    GROUP BY sid, stitle, sct, stotal
  ),
  computed AS (
    SELECT
      a.*,
      -- Limite esperado: total_volumes ou max(vol) se não tiver
      COALESCE(a.stotal, a.max_v) AS expected_max,
      -- Calcula faltantes em 1..expected_max
      CASE
        WHEN COALESCE(a.stotal, a.max_v) IS NULL OR COALESCE(a.stotal, a.max_v) < 1 THEN '{}'::int[]
        ELSE (
          SELECT COALESCE(array_agg(g ORDER BY g), '{}'::int[])
          FROM generate_series(1, COALESCE(a.stotal, a.max_v)) AS g
          WHERE NOT (g = ANY (COALESCE(a.vols, '{}'::int[])))
        )
      END AS missing,
      -- Duplicados
      CASE
        WHEN a.vols IS NULL THEN '{}'::int[]
        ELSE (
          SELECT COALESCE(array_agg(v ORDER BY v), '{}'::int[])
          FROM (
            SELECT v FROM unnest(a.vols) AS v
            GROUP BY v HAVING COUNT(*) > 1
          ) d
        )
      END AS duplicates
    FROM agg a
  )
  SELECT
    sid                                                AS series_id,
    stitle                                             AS series_title,
    sct                                                AS content_type,
    stotal                                             AS total_volumes,
    books_count,
    numbered_count,
    unnumbered_count,
    min_v                                              AS min_volume,
    max_v                                              AS max_volume,
    missing                                            AS missing_volumes,
    duplicates                                         AS duplicate_volumes,
    (array_length(missing, 1) > 0)                     AS has_gaps,
    (array_length(duplicates, 1) > 0)                  AS has_duplicates,
    (unnumbered_count > 0)                             AS has_unnumbered,
    (array_length(missing, 1) IS NULL
       AND array_length(duplicates, 1) IS NULL
       AND unnumbered_count = 0
       AND books_count > 0)                            AS is_complete,
    CASE
      WHEN array_length(duplicates, 1) > 0 THEN 'high'
      WHEN unnumbered_count > 0           THEN 'high'
      WHEN array_length(missing, 1) > 0   THEN 'medium'
      ELSE 'low'
    END                                                AS severity
  FROM computed
  WHERE
    array_length(missing, 1) > 0
    OR array_length(duplicates, 1) > 0
    OR unnumbered_count > 0
  ORDER BY
    CASE
      WHEN array_length(duplicates, 1) > 0 THEN 0
      WHEN unnumbered_count > 0           THEN 1
      ELSE 2
    END,
    stitle;
$$;

-- Permitir que qualquer usuário autenticado execute (a função só lê metadados de séries).
REVOKE ALL ON FUNCTION public.validate_series_integrity() FROM public;
GRANT EXECUTE ON FUNCTION public.validate_series_integrity() TO authenticated;

-- Função auxiliar: corrigir volumes não numerados de UMA série, atribuindo
-- números sequenciais por created_at preenchendo as lacunas.
CREATE OR REPLACE FUNCTION public.repair_series_numbering(_series_id uuid)
RETURNS TABLE (book_id uuid, old_volume integer, new_volume integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used int[];
  candidate int;
  rec record;
BEGIN
  -- Coleta volumes já usados
  SELECT COALESCE(array_agg(volume_number), '{}'::int[])
    INTO used
  FROM public.books
  WHERE series_id = _series_id AND volume_number IS NOT NULL;

  -- Para cada livro sem volume, encontra o próximo número livre
  FOR rec IN
    SELECT id, created_at
    FROM public.books
    WHERE series_id = _series_id AND volume_number IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    candidate := 1;
    WHILE candidate = ANY (used) LOOP
      candidate := candidate + 1;
    END LOOP;

    UPDATE public.books SET volume_number = candidate WHERE id = rec.id;
    used := array_append(used, candidate);

    book_id := rec.id;
    old_volume := NULL;
    new_volume := candidate;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_series_numbering(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.repair_series_numbering(uuid) TO authenticated;