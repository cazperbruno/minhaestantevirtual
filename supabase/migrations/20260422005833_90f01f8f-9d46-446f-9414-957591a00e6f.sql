
-- Tabela de tokens CSRF para o painel admin
CREATE TABLE IF NOT EXISTS public.admin_csrf_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_csrf_tokens_user
  ON public.admin_csrf_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_csrf_tokens_hash
  ON public.admin_csrf_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_csrf_tokens_expires
  ON public.admin_csrf_tokens (expires_at);

ALTER TABLE public.admin_csrf_tokens ENABLE ROW LEVEL SECURITY;

-- Sem políticas: apenas service_role acessa (bypass de RLS).
-- Clientes, mesmo autenticados, NÃO podem ler nem inserir tokens diretamente.

-- Função utilitária de limpeza (chamada por cron ou pelos próprios endpoints).
CREATE OR REPLACE FUNCTION public.cleanup_expired_admin_csrf_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM public.admin_csrf_tokens
  WHERE expires_at < now() - INTERVAL '1 hour';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;
