import { supabase } from "@/integrations/supabase/client";

/**
 * Invoca uma edge function admin injetando o token anti-CSRF.
 * Nunca cai num "GET sem token" — se não houver token, falha cedo.
 *
 * Uso: invokeAdmin("seed-book-database", { body: {...}, csrfToken })
 */
export async function invokeAdmin<T = unknown>(
  fn: string,
  opts: { body?: any; csrfToken: string | null },
): Promise<{ data: T | null; error: Error | null }> {
  if (!opts.csrfToken) {
    return {
      data: null,
      error: new Error(
        "Token CSRF ausente — recarregue a página do painel para obter um novo token.",
      ),
    };
  }
  const { data, error } = await supabase.functions.invoke(fn, {
    body: opts.body ?? {},
    headers: { "X-CSRF-Token": opts.csrfToken },
  });
  return { data: (data as T) ?? null, error: error ?? null };
}
