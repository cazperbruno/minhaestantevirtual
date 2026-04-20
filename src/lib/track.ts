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
