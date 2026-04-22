// Engine de recomendação inteligente — combina SQL multi-sinal + IA opcional.
// Retorna prateleiras tipo Netflix prontas para o cliente renderizar.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface Shelf {
  id: string;
  title: string;
  reason?: string;
  books: any[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "shelves"; // shelves | feed
    const cursor = parseInt(url.searchParams.get("cursor") || "0", 10);
    const pageSize = parseInt(url.searchParams.get("limit") || "20", 10);

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader || "" } } },
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== FEED INFINITO ======
    if (mode === "feed") {
      // Busca uma fatia maior e pagina offline; garante variedade misturando popular + afinidade
      const { data: recs } = await supabase.rpc("recommend_for_user", {
        _user_id: user.id, _limit: 200,
      });

      const ids = (recs || []).slice(cursor, cursor + pageSize).map((r: any) => r.id);
      if (ids.length === 0) {
        // Fallback: tendências globais quando esgotar
        const { data: trend } = await supabase
          .from("books")
          .select("*")
          .not("cover_url", "is", null)
          .order("created_at", { ascending: false })
          .range(cursor, cursor + pageSize - 1);
        return new Response(JSON.stringify({
          books: trend || [],
          nextCursor: cursor + (trend?.length || 0),
          hasMore: (trend?.length || 0) === pageSize,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: books } = await supabase
        .from("books").select("*").in("id", ids);

      // Reordena na ordem do score
      const byId = new Map((books || []).map((b: any) => [b.id, b]));
      const reasonById = new Map((recs || []).map((r: any) => [r.id, r.reason]));
      const ordered = ids.map((id) => {
        const b = byId.get(id);
        return b ? { ...b, _reason: reasonById.get(id) } : null;
      }).filter(Boolean);

      return new Response(JSON.stringify({
        books: ordered,
        nextCursor: cursor + ordered.length,
        hasMore: cursor + ordered.length < (recs?.length || 0),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ====== PRATELEIRAS NETFLIX ======
    const shelves: Shelf[] = [];

    // 0) Filtragem colaborativa — "Leitores parecidos com você leram"
    const { data: collab } = await supabase.rpc("get_collaborative_recommendations", {
      target_user_id: user.id,
    });
    if (collab && collab.length > 0) {
      const top = collab.slice(0, 14);
      const ids = top.map((c: any) => c.book_id);
      const { data: books } = await supabase
        .from("books").select("*").in("id", ids).not("cover_url", "is", null);
      if (books && books.length > 0) {
        const byId = new Map(books.map((b: any) => [b.id, b]));
        const readersById = new Map(top.map((c: any) => [c.book_id, c.reader_count]));
        const ordered = ids
          .map((id: string) => {
            const b = byId.get(id);
            const rc = readersById.get(id);
            return b ? { ...b, _reason: `${rc} ${rc === 1 ? "leitor parecido leu" : "leitores parecidos leram"}` } : null;
          })
          .filter(Boolean);
        if (ordered.length > 0) {
          shelves.push({
            id: "reading_twins",
            title: "Leitores parecidos com você leram",
            reason: "Pessoas com gosto semelhante adoraram estes livros",
            books: ordered,
          });
        }
      }
    }

    // 1) Recomendado para você (engine multi-sinal)
    const { data: personalized } = await supabase.rpc("recommend_for_user", {
      _user_id: user.id, _limit: 18,
    });

    if (personalized && personalized.length > 0) {
      const ids = personalized.map((r: any) => r.id);
      const { data: books } = await supabase.from("books").select("*").in("id", ids);
      const byId = new Map((books || []).map((b: any) => [b.id, b]));
      const reasonById = new Map((personalized || []).map((r: any) => [r.id, r.reason]));
      const ordered = ids
        .map((id: string) => {
          const b = byId.get(id);
          return b ? { ...b, _reason: reasonById.get(id) } : null;
        })
        .filter(Boolean);
      shelves.push({
        id: "for_you",
        title: "Baseado no seu perfil",
        reason: "Combinamos seus gostos, autores favoritos e tendências",
        books: ordered,
      });
    }

    // 2) "Porque você leu X" — pega o último livro lido com rating>=4
    const { data: lastLoved } = await supabase
      .from("user_books")
      .select("book_id, rating, book:books(title, authors)")
      .eq("user_id", user.id)
      .eq("status", "read")
      .gte("rating", 4)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastLoved) {
      const { data: similar } = await supabase.rpc("similar_books", {
        _book_id: lastLoved.book_id, _limit: 14,
      });
      if (similar && similar.length > 0) {
        const ids = similar.map((s: any) => s.id);
        const { data: books } = await supabase
          .from("books").select("*").in("id", ids).not("cover_url", "is", null);
        if (books && books.length > 0) {
          shelves.push({
            id: "because_you_read",
            title: `Porque você leu ${(lastLoved as any).book?.title || "esse"}`,
            books,
          });
        }
      }
    }

    // 2.5) Amigos lendo agora — quem eu sigo está lendo nas últimas 2 semanas
    const { data: friendsReading } = await supabase.rpc("friends_reading_now", {
      _user_id: user.id, _limit: 14,
    });
    if (friendsReading && friendsReading.length > 0) {
      const ids = friendsReading.map((f: any) => f.book_id);
      const { data: books } = await supabase
        .from("books").select("*").in("id", ids).not("cover_url", "is", null);
      if (books && books.length > 0) {
        const byId = new Map(books.map((b: any) => [b.id, b]));
        const countById = new Map(friendsReading.map((f: any) => [f.book_id, f.friends_count]));
        const ordered = ids
          .map((id: string) => {
            const b = byId.get(id);
            const c = countById.get(id);
            return b ? { ...b, _reason: `${c} ${c === 1 ? "amigo está lendo" : "amigos estão lendo"}` } : null;
          })
          .filter(Boolean);
        if (ordered.length > 0) {
          shelves.push({
            id: "friends_reading",
            title: "Amigos lendo agora",
            reason: "Pessoas que você segue estão lendo isso",
            books: ordered,
          });
        }
      }
    }

    // 2.6) Em alta no seu círculo — atividades recentes (rate/finish/add) entre quem sigo
    const { data: circleTrending } = await supabase.rpc("trending_in_circle", {
      _user_id: user.id, _limit: 14,
    });
    if (circleTrending && circleTrending.length > 0) {
      const ids = circleTrending.map((t: any) => t.book_id);
      const { data: books } = await supabase
        .from("books").select("*").in("id", ids).not("cover_url", "is", null);
      if (books && books.length > 0) {
        const byId = new Map(books.map((b: any) => [b.id, b]));
        const ordered = ids
          .map((id: string) => {
            const b = byId.get(id);
            return b ? { ...b, _reason: "Em alta no seu círculo" } : null;
          })
          .filter(Boolean);
        if (ordered.length > 0) {
          shelves.push({
            id: "trending_in_circle",
            title: "Em alta no seu círculo",
            reason: "Mais comentado por quem você segue",
            books: ordered,
          });
        }
      }
    }

    // 3) Tendências globais
    const { data: trending } = await supabase
      .from("trending_books")
      .select("id, score")
      .order("score", { ascending: false })
      .limit(14);
    if (trending && trending.length > 0) {
      const ids = trending.map((t: any) => t.id);
      const { data: books } = await supabase
        .from("books").select("*").in("id", ids).not("cover_url", "is", null);
      if (books && books.length > 0) {
        const byId = new Map(books.map((b: any) => [b.id, b]));
        shelves.push({
          id: "trending",
          title: "Tendências agora",
          books: ids.map((id) => byId.get(id)).filter(Boolean),
        });
      }
    }

    // 4) Volte a ler — livros 'reading' há mais de 14 dias sem update
    const { data: stale } = await supabase
      .from("user_books")
      .select("*, book:books(*)")
      .eq("user_id", user.id)
      .eq("status", "reading")
      .lt("updated_at", new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
      .limit(8);
    if (stale && stale.length > 0) {
      shelves.push({
        id: "resume",
        title: "Volte a ler",
        reason: "Você começou e vale a pena terminar",
        books: stale.map((s: any) => s.book).filter(Boolean),
      });
    }

    // 5) Descubra algo novo — categorias que NÃO estão no perfil
    const { data: taste } = await supabase.rpc("user_taste", { _user_id: user.id });
    const knownCats = new Set((taste || []).map((t: any) => t.category));
    if (knownCats.size > 0) {
      const { data: novel } = await supabase
        .from("books")
        .select("*")
        .not("cover_url", "is", null)
        .not("categories", "is", null)
        .order("created_at", { ascending: false })
        .limit(60);
      const filtered = (novel || []).filter((b: any) =>
        (b.categories || []).every((c: string) => !knownCats.has(c))
      ).slice(0, 12);
      if (filtered.length > 0) {
        shelves.push({
          id: "discover_new",
          title: "Descubra algo novo",
          reason: "Categorias que você ainda não explorou",
          books: filtered,
        });
      }
    }

    return new Response(JSON.stringify({ shelves }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("recommend-feed error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
