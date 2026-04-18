// AI-powered book recommendations using Lovable AI Gateway
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
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pega últimos livros lidos/avaliados
    const { data: ub } = await supabase
      .from("user_books")
      .select("rating,status,book:books(title,authors,categories)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20);

    const list = (ub || []).filter((x: any) => x.book);
    if (list.length < 2) {
      return new Response(JSON.stringify({ recommendations: [], reason: "Adicione ao menos 2 livros à sua biblioteca" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = list.slice(0, 12).map((x: any) => {
      const b = x.book;
      const cats = (b.categories || []).slice(0, 2).join(", ");
      return `- "${b.title}" — ${(b.authors || []).join(", ")}${cats ? ` (${cats})` : ""}${x.rating ? ` ★${x.rating}` : ""} [${x.status}]`;
    }).join("\n");

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Você é um curador de livros experiente. Recomende títulos novos com base no histórico do usuário, evitando livros já lidos. Responda em português.",
          },
          {
            role: "user",
            content: `Histórico de leitura:\n${summary}\n\nRecomende 6 livros novos que combinem com este perfil.`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "recommend",
            description: "Retorna 6 recomendações de livros",
            parameters: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      author: { type: "string" },
                      reason: { type: "string", description: "Por que combina com o usuário (máx 100 caracteres)" },
                    },
                    required: ["title", "author", "reason"],
                  },
                },
              },
              required: ["recommendations"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "recommend" } },
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

    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : { recommendations: [] };

    return new Response(JSON.stringify(args), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("recommend-books error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
