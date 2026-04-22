
-- Política explícita "deny-all" — ninguém com login normal pode acessar.
-- Apenas service_role (que ignora RLS) consegue manipular tokens.
CREATE POLICY "deny_all_access_to_csrf_tokens"
ON public.admin_csrf_tokens
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);
