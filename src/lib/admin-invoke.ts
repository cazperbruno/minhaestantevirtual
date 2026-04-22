import { supabase } from "@/integrations/supabase/client";

async function normalizeFunctionError(error: unknown): Promise<Error | null> {
  if (!error) return null;

  const fallback =
    error instanceof Error
      ? error
      : new Error("Falha ao executar operação administrativa.");

  const response = (error as { context?: Response | null })?.context;
  if (!response || typeof response.clone !== "function") return fallback;

  try {
    const cloned = response.clone();
    const contentType = cloned.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const payload = await cloned.json().catch(() => null);
      const message = payload?.error || payload?.message || payload?.details;
      if (typeof message === "string" && message.trim()) {
        return new Error(message.trim());
      }
    }

    const text = await cloned.text().catch(() => "");
    if (text.trim()) {
      try {
        const payload = JSON.parse(text);
        const message = payload?.error || payload?.message || payload?.details;
        if (typeof message === "string" && message.trim()) {
          return new Error(message.trim());
        }
      } catch {
        return new Error(text.trim());
      }
    }
  } catch {
    return fallback;
  }

  return fallback;
}

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

  return {
    data: (data as T) ?? null,
    error: await normalizeFunctionError(error),
  };
}
