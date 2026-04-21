
-- Cache global de enriquecimento de séries: aprende uma vez, serve para todos os usuários.
CREATE TABLE IF NOT EXISTS public.series_enrichment_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Chave normalizada (título + content_type) para lookup rápido entre séries equivalentes
  cache_key text NOT NULL,
  content_type public.content_type NOT NULL,
  title text NOT NULL,
  authors text[] NOT NULL DEFAULT '{}',
  total_volumes integer,
  total_chapters integer,
  status text,
  description text,
  cover_url text,
  banner_url text,
  categories text[] DEFAULT '{}',
  published_year integer,
  source text NOT NULL, -- 'anilist' | 'ai' | 'manual'
  source_id text,
  raw jsonb,
  confidence real NOT NULL DEFAULT 0.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cache_key, content_type)
);

CREATE INDEX IF NOT EXISTS idx_series_enrichment_cache_key
  ON public.series_enrichment_cache (cache_key, content_type);

ALTER TABLE public.series_enrichment_cache ENABLE ROW LEVEL SECURITY;

-- Cache global: leitura pública (catálogo), escrita só via service role (edge function).
CREATE POLICY "series_enrichment_cache_select_all"
  ON public.series_enrichment_cache FOR SELECT
  USING (true);

CREATE TRIGGER set_series_enrichment_cache_updated_at
  BEFORE UPDATE ON public.series_enrichment_cache
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auditoria de quando a série foi enriquecida pela última vez.
ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS enriched_by text;

-- Permitir que QUALQUER usuário autenticado dispare melhoria de uma série
-- (apenas em campos seguros: total_volumes, status, description, cover_url, total_chapters,
--  categories, published_year, source, source_id, raw, last_enriched_at, enriched_by).
-- Não permite renomear série / mudar autor / mudar content_type por essa via.
CREATE OR REPLACE FUNCTION public.enrich_series_apply(
  _series_id uuid,
  _total_volumes integer,
  _total_chapters integer,
  _status text,
  _description text,
  _cover_url text,
  _categories text[],
  _published_year integer,
  _source text,
  _source_id text,
  _raw jsonb
) RETURNS public.series
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.series;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  UPDATE public.series s
     SET total_volumes  = COALESCE(_total_volumes,  s.total_volumes),
         status         = COALESCE(_status,         s.status),
         description    = COALESCE(_description,    s.description),
         cover_url      = COALESCE(_cover_url,      s.cover_url),
         source         = COALESCE(_source,         s.source),
         source_id      = COALESCE(_source_id,      s.source_id),
         raw            = COALESCE(_raw,            s.raw),
         last_enriched_at = now(),
         enriched_by    = COALESCE(_source, 'unknown')
   WHERE s.id = _series_id
   RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enrich_series_apply(
  uuid, integer, integer, text, text, text, text[], integer, text, text, jsonb
) TO authenticated;
