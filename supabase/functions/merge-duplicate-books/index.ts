// deno-lint-ignore-file no-explicit-any
/**
 * merge-duplicate-books — detecta e mescla livros duplicados.
 *
 * Estratégia conservadora:
 *  1. Agrupa por ISBN-13 (forte) e por ISBN-10 (forte)
 *  2. Para grupos com ≥ 2 livros, escolhe o "canônico":
 *     - o que tem MAIS user_books referenciando
 *     - empate → o mais antigo (menor created_at)
 *  3. Re-aponta TODAS as referências (user_books, reviews, activities,
 *     buddy_reads, trades, recommendations, loans, stories, nominations,
 *     book_clubs.current_book_id) para o canônico
 *  4. Trata conflitos UNIQUE (mesmo user com mesmo livro em duplicata)
 *     mantendo o registro mais "rico" (maior current_page, status mais avançado)
 *  5. Apaga os duplicados
 *
 * NUNCA mescla livros sem ISBN (risco alto de falso-positivo).
 *
 * Body: { dryRun?: boolean, limit?: number }
 * Restrito a admin.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STATUS_RANK: Record<string, number> = {
  not_read: 0,
  wishlist: 1,
  reading: 2,
  paused: 2,
  abandoned: 1,
  read: 3,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const authClient = createClient(supaUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: uErr } = await authClient.auth.getUser();
    if (uErr || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = createClient(supaUrl, serviceKey);

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return jsonResponse({ error: "Admin only" }, 403);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }
    const dryRun = body?.dryRun === true;
    const limit = Math.min(Number.isFinite(body?.limit) ? body.limit : 5000, 10000);

    // 1. carrega livros com ISBN
    const { data: books, error: bErr } = await supabase
      .from("books")
      .select("id,title,isbn_13,isbn_10,created_at")
      .or("isbn_13.not.is.null,isbn_10.not.is.null")
      .limit(limit);
    if (bErr) return jsonResponse({ error: bErr.message }, 500);

    // 2. agrupa por ISBN
    const groups = new Map<string, Array<{ id: string; title: string; created_at: string }>>();
    for (const b of books ?? []) {
      const keys: string[] = [];
      if (b.isbn_13) keys.push(`13:${b.isbn_13.replace(/\D/g, "")}`);
      if (b.isbn_10) keys.push(`10:${b.isbn_10.replace(/\W/g, "").toUpperCase()}`);
      for (const k of keys) {
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push({ id: b.id, title: b.title, created_at: b.created_at });
      }
    }

    const dupGroups = [...groups.entries()].filter(([, arr]) => arr.length >= 2);

    const result = {
      total_groups: groups.size,
      duplicate_groups: dupGroups.length,
      merged: 0,
      deleted: 0,
      conflicts_resolved: 0,
      sample: [] as any[],
    };

    if (dryRun) {
      result.sample = dupGroups.slice(0, 30).map(([k, arr]) => ({
        isbn: k,
        count: arr.length,
        titles: arr.map((b) => `${b.title} (${b.id.slice(0, 8)})`),
      }));
      return jsonResponse(result);
    }

    // 3. processa cada grupo
    const processed = new Set<string>();
    for (const [, arr] of dupGroups) {
      // dedupe ids dentro do grupo (caso isbn_13 e isbn_10 sobreponham)
      const uniq = arr.filter((b, i, a) => a.findIndex((x) => x.id === b.id) === i);
      if (uniq.length < 2) continue;

      // se já processamos algum desses ids num grupo anterior, pula
      if (uniq.some((b) => processed.has(b.id))) continue;

      // escolhe canônico: mais user_books, empate = mais antigo
      const counts = await Promise.all(
        uniq.map(async (b) => {
          const { count } = await supabase
            .from("user_books")
            .select("*", { count: "exact", head: true })
            .eq("book_id", b.id);
          return { ...b, refs: count ?? 0 };
        }),
      );
      counts.sort((a, b) => (b.refs - a.refs) || (a.created_at.localeCompare(b.created_at)));
      const canonical = counts[0];
      const losers = counts.slice(1);

      for (const loser of losers) {
        // 3a. user_books — pode haver conflito (user_id, book_id) único
        await mergeUserBooks(supabase, loser.id, canonical.id, result);

        // 3b. tabelas simples: re-aponta book_id
        for (const tbl of [
          "reviews",
          "activities",
          "buddy_reads",
          "stories",
          "loans",
          "club_book_nominations",
          "book_recommendations",
        ]) {
          await supabase.from(tbl).update({ book_id: canonical.id }).eq("book_id", loser.id);
        }
        // trades têm dois campos
        await supabase.from("trades").update({ proposer_book_id: canonical.id }).eq("proposer_book_id", loser.id);
        await supabase.from("trades").update({ receiver_book_id: canonical.id }).eq("receiver_book_id", loser.id);
        // book_clubs.current_book_id
        await supabase.from("book_clubs").update({ current_book_id: canonical.id }).eq("current_book_id", loser.id);

        // 3c. apaga o livro perdedor
        const { error: dErr } = await supabase.from("books").delete().eq("id", loser.id);
        if (!dErr) {
          result.deleted++;
          processed.add(loser.id);
        } else {
          console.warn(`could not delete ${loser.id}:`, dErr.message);
        }
      }
      processed.add(canonical.id);
      result.merged++;
    }

    return jsonResponse(result);
  } catch (e) {
    console.error("merge-duplicate-books error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro" }, 500);
  }
});

async function mergeUserBooks(
  supabase: any,
  loserId: string,
  canonicalId: string,
  result: { conflicts_resolved: number },
) {
  const { data: loserUbs } = await supabase
    .from("user_books")
    .select("*")
    .eq("book_id", loserId);
  if (!loserUbs?.length) return;

  for (const lub of loserUbs) {
    const { data: existing } = await supabase
      .from("user_books")
      .select("*")
      .eq("user_id", lub.user_id)
      .eq("book_id", canonicalId)
      .maybeSingle();

    if (!existing) {
      // só re-aponta
      await supabase.from("user_books").update({ book_id: canonicalId }).eq("id", lub.id);
    } else {
      // mescla mantendo o "mais rico"
      const winner = pickRicher(existing, lub);
      const merged = {
        status: winner.status,
        current_page: Math.max(existing.current_page ?? 0, lub.current_page ?? 0),
        rating: existing.rating ?? lub.rating ?? null,
        notes: existing.notes || lub.notes || null,
        started_at: oldest(existing.started_at, lub.started_at),
        finished_at: latest(existing.finished_at, lub.finished_at),
        available_for_trade: existing.available_for_trade || lub.available_for_trade,
        available_for_loan: existing.available_for_loan || lub.available_for_loan,
        is_public: existing.is_public && lub.is_public,
        updated_at: new Date().toISOString(),
      };
      await supabase.from("user_books").update(merged).eq("id", existing.id);
      // re-aponta notas do perdedor para o vencedor
      await supabase.from("user_book_notes").update({ user_book_id: existing.id }).eq("user_book_id", lub.id);
      await supabase.from("user_books").delete().eq("id", lub.id);
      result.conflicts_resolved++;
    }
  }
}

function pickRicher(a: any, b: any) {
  const ra = STATUS_RANK[a.status] ?? 0;
  const rb = STATUS_RANK[b.status] ?? 0;
  return ra >= rb ? a : b;
}
function oldest(a?: string | null, b?: string | null) {
  if (!a) return b ?? null;
  if (!b) return a;
  return a < b ? a : b;
}
function latest(a?: string | null, b?: string | null) {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
