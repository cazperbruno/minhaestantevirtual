// deno-lint-ignore-file no-explicit-any
// =====================================================================
// normalize-book-meta — Auto-correção de metadados via Lovable AI
// Recebe { book_id }. Lê o livro, manda para o modelo limpar título,
// autores e descrição. Aplica patch idempotente.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um bibliotecário especialista em metadados de livros. Recebe metadados sujos (CAPS, encoding quebrado, autor invertido "Sobrenome, Nome", lixo no início) e retorna versão limpa em JSON estrito.

Regras:
- Título: capitalização correta em português (Title Case PT, mantém artigos minúsculos: a, o, de, do, da, e, em, com)
- Autores: ordem natural "Nome Sobrenome", não inverter. Array de strings.
- Descrição: corrige encoding (Ã© → é, Ã¡ → á, etc), mantém o conteúdo
- Idioma: detecta (pt, en, es, etc)
- NUNCA invente dados. Se faltar info, retorne null para o campo.
- NUNCA mude o significado, apenas a forma.

Retorne APENAS JSON válido neste formato:
{"title": "...", "authors": ["..."], "description": "..." | null, "language": "..." | null}`;

interface BookRow {
  id: string;
  title: string;
  authors: string[];
  description: string | null;
  language: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const bookId = body?.book_id as string | undefined;
    if (!bookId) {
      return new Response(JSON.stringify({ error: "book_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: book, error } = await sb
      .from("books")
      .select("id,title,authors,description,language")
      .eq("id", bookId)
      .maybeSingle();

    if (error || !book) {
      return new Response(JSON.stringify({ error: "book not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const b = book as BookRow;
    const userPrompt = JSON.stringify({
      title: b.title,
      authors: b.authors,
      description: b.description?.slice(0, 2000) ?? null,
      current_language: b.language,
    });

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "ai_credits_exhausted" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      return new Response(JSON.stringify({ error: `ai_error: ${aiResp.status} ${t.slice(0,200)}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ai = await aiResp.json();
    const raw = ai.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    const patch: Partial<BookRow> = {};
    const changed: string[] = [];

    // Sanity: só aplica se o resultado é razoável
    if (typeof parsed.title === "string" && parsed.title.length > 0 && parsed.title !== b.title) {
      // Não muda se a similaridade é baixa demais (provavelmente alucinação)
      const sim = jaccardSim(b.title.toLowerCase(), parsed.title.toLowerCase());
      if (sim >= 0.45) {
        patch.title = parsed.title.trim().slice(0, 500);
        changed.push("title");
      }
    }
    if (Array.isArray(parsed.authors) && parsed.authors.length > 0) {
      const cleaned = parsed.authors
        .filter((a: any) => typeof a === "string" && a.length > 0)
        .map((a: string) => a.trim().slice(0, 200));
      if (cleaned.length && JSON.stringify(cleaned) !== JSON.stringify(b.authors)) {
        patch.authors = cleaned;
        changed.push("authors");
      }
    }
    if (typeof parsed.description === "string" && parsed.description.length > 30 && parsed.description !== b.description) {
      patch.description = parsed.description.trim();
      changed.push("description");
    }
    if (!b.language && typeof parsed.language === "string" && parsed.language.length >= 2) {
      patch.language = parsed.language.toLowerCase().slice(0, 8);
      changed.push("language");
    }

    if (changed.length === 0) {
      return new Response(JSON.stringify({ ok: true, fields_changed: [], skipped: "no-improvement" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: upErr } = await sb.from("books").update(patch).eq("id", bookId);
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, fields_changed: changed, patch }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function jaccardSim(a: string, b: string): number {
  const sa = new Set(a.split(/\s+/).filter(Boolean));
  const sb = new Set(b.split(/\s+/).filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}
