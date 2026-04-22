/**
 * classify-clubs
 * Lê clubes com category = 'geral' e classifica via Lovable AI numa das categorias curadas.
 * Atualiza book_clubs.category. Idempotente.
 *
 * Acesso: somente admin (header Authorization).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_CATEGORIES = [
  "manga", "fantasia", "romance", "hq", "autoajuda",
  "classicos", "nao_ficcao", "sci_fi", "terror", "infantojuvenil", "geral",
] as const;

const SYSTEM_PROMPT = `Você é um classificador de clubes de leitura. Receberá nome, descrição e (se houver) o livro do mês de um clube. Responda SOMENTE com um JSON no formato {"category":"<slug>"} onde slug é UM destes:
- manga (mangás japoneses)
- fantasia (fantasia, magia, alta fantasia)
- romance (romances, romcom, romance de época)
- hq (quadrinhos, comics americanos, graphic novels)
- sci_fi (ficção científica, distopia)
- terror (terror, horror, suspense sombrio)
- classicos (literatura clássica, séc. XIX e antes)
- nao_ficcao (história, ciência, biografia, ensaio)
- autoajuda (autoajuda, hábitos, produtividade, mindset)
- infantojuvenil (infantil ou jovem adulto)
- geral (quando não houver sinal claro)

Use 'geral' apenas quando realmente não der pra inferir. Sem texto extra.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleCheck } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Busca clubes em 'geral' (default), até 50 por execução
    const { data: clubs, error: clubsErr } = await admin
      .from("book_clubs")
      .select("id,name,description,category,current_book_id,books:current_book_id(title,categories)")
      .eq("category", "geral")
      .limit(50);

    if (clubsErr) throw clubsErr;
    if (!clubs || clubs.length === 0) {
      return new Response(JSON.stringify({ updated: 0, message: "no clubs to classify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const club of clubs) {
      const bookInfo = club.books
        ? `Livro do mês: "${club.books.title}" (categorias: ${(club.books.categories || []).join(", ") || "—"})`
        : "Sem livro do mês.";
      const userMsg = `Nome: ${club.name}\nDescrição: ${club.description || "—"}\n${bookInfo}`;

      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userMsg },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (!aiRes.ok) {
          errors.push({ id: club.id, error: `ai ${aiRes.status}` });
          continue;
        }
        const aiJson = await aiRes.json();
        const raw = aiJson?.choices?.[0]?.message?.content || "{}";
        let parsed: { category?: string };
        try { parsed = JSON.parse(raw); } catch { parsed = {}; }
        const cat = parsed.category && (ALLOWED_CATEGORIES as readonly string[]).includes(parsed.category)
          ? parsed.category
          : "geral";

        if (cat !== "geral") {
          const { error: upErr } = await admin
            .from("book_clubs")
            .update({ category: cat })
            .eq("id", club.id);
          if (upErr) errors.push({ id: club.id, error: upErr.message });
          else updated++;
        }
      } catch (e) {
        errors.push({ id: club.id, error: e instanceof Error ? e.message : "unknown" });
      }
    }

    return new Response(JSON.stringify({ processed: clubs.length, updated, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("classify-clubs error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
