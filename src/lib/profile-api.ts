import { supabase } from "@/integrations/supabase/client";

/**
 * Perfil completo do usuário autenticado.
 *
 * Dados sensíveis de `profiles` (bio, redes sociais, privacidade, onboarding,
 * tutorial e preferências) não devem ser consultados diretamente pela tabela.
 * O banco expõe esses campos somente ao próprio usuário via RPC self-only.
 */
export async function getMyProfile<T = Record<string, unknown>>(): Promise<T | null> {
  const { data, error } = await supabase.rpc("get_my_profile" as never);
  if (error) throw error;
  return (data ?? null) as T | null;
}
