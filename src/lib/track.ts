// Tracking leve de interações — alimenta o motor de IA continuamente.
// Tudo é fire-and-forget: nunca bloqueia UI, nunca lança erro visível.
import { supabase } from "@/integrations/supabase/client";

type Kind = "view" | "click" | "dismiss" | "favorite" | "search";

const sent = new Set<string>(); // dedup por sessão (book+kind)

export function track(kind: Kind, bookId: string | undefined | null, meta?: Record<string, any>) {
  if (!bookId) return;
  // Dedup views/clicks na mesma sessão (sem perder dismisses/favorites)
  if (kind === "view" || kind === "click") {
    const key = `${kind}:${bookId}`;
    if (sent.has(key)) return;
    sent.add(key);
  }
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_interactions").insert({
      user_id: user.id,
      book_id: bookId,
      kind,
      weight: kind === "favorite" ? 5 : kind === "dismiss" ? -3 : 1,
      meta: meta ?? null,
    });
  })().catch(() => { /* silent */ });
}

// ---------------------------------------------------------------------------
// Telemetria de fluxos (sem book_id) — alimenta análises de produto.
// Eventos críticos: search_*, scanner_*, import_*, amazon_fallback_*, error_*.
// ---------------------------------------------------------------------------

const SESSION_KEY = "rfy_session_id";
function getSessionId(): string {
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return "s_unknown";
  }
}

/**
 * Registra um evento de produto (busca, scanner, importação, falhas...).
 * Aceita usuário anônimo (user_id=null). Fire-and-forget.
 *
 * @example
 *   trackEvent("search_executed", { query: "1984", results: 12, latency_ms: 340 });
 *   trackEvent("scanner_isbn_not_found", { isbn: "9788535909555" });
 *   trackEvent("amazon_fallback_clicked", { query: "livro raro" });
 */
export function trackEvent(event: string, props?: Record<string, any>) {
  if (!event) return;
  (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("app_events").insert({
        user_id: user?.id ?? null,
        event,
        props: props ?? null,
        session_id: getSessionId(),
      });
    } catch {
      /* silent — telemetria nunca quebra UX */
    }
  })();
}
