// Chat IA contextualizado a um livro — streaming via Lovable AI
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { bookId, messages } = await req.json();
    if (!bookId || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "bookId e messages obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: book } = await supabase
      .from("books").select("title,subtitle,authors,published_year,description,categories")
      .eq("id", bookId).maybeSingle();

    if (!book) {
      return new Response(JSON.stringify({ error: "Livro não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx = `LIVRO EM DISCUSSÃO:
Título: ${book.title}${book.subtitle ? ` — ${book.subtitle}` : ""}
Autores: ${(book.authors || []).join(", ") || "desconhecido"}
${book.published_year ? `Publicado em: ${book.published_year}\n` : ""}${book.categories?.length ? `Categorias: ${book.categories.join(", ")}\n` : ""}${book.description ? `Sinopse oficial: ${book.description.slice(0, 800)}` : ""}`;

    const systemPrompt = `Você é um companheiro de leitura erudito e simpático. Discuta o livro abaixo respondendo perguntas sobre temas, personagens, contexto histórico, sugestões de livros similares e curiosidades. SEMPRE responda em português. NUNCA dê spoilers a menos que o usuário peça explicitamente. Se o usuário perguntar algo fora do escopo do livro ou de literatura, redirecione gentilmente.\n\n${ctx}`;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.slice(-12),
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Limite atingido. Tente em instantes." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos AI insuficientes." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error", t);
      return new Response(JSON.stringify({ error: "Falha na IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiRes.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("book-chat error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
