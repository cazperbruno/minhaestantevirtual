-- Função SECURITY DEFINER que retorna interações agregadas globalmente,
-- mas SOMENTE quando o chamador é admin. Caso contrário, lança exceção.
CREATE OR REPLACE FUNCTION public.get_affiliate_interactions_admin(_from timestamptz)
RETURNS TABLE (
  book_id uuid,
  kind text,
  created_at timestamptz,
  meta jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT ui.book_id, ui.kind, ui.created_at, ui.meta
  FROM public.user_interactions ui
  WHERE ui.kind IN ('click', 'view')
    AND (_from IS NULL OR ui.created_at >= _from)
  ORDER BY ui.created_at DESC
  LIMIT 20000;
END;
$$;

REVOKE ALL ON FUNCTION public.get_affiliate_interactions_admin(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_affiliate_interactions_admin(timestamptz) TO authenticated;