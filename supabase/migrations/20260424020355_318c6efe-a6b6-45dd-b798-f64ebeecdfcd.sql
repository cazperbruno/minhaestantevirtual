-- 1) Mover extensão pg_trgm de public para extensions (resolve warning do linter)
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- Garante que extensions está no search_path padrão para que operadores trigram funcionem
ALTER DATABASE postgres SET search_path TO "$user", public, extensions;

-- 2) Tabela de auditoria administrativa expandida (login, role changes, ações sensíveis)
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON public.admin_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ler logs administrativos
CREATE POLICY "Admins can read audit log"
  ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Insert apenas via service role (edge functions) — nenhuma policy de INSERT
-- significa que nenhum cliente pode inserir, só service_role bypassa RLS

COMMENT ON TABLE public.admin_audit_log IS 'Log de ações administrativas sensíveis. Inserts apenas via edge functions com service_role.';