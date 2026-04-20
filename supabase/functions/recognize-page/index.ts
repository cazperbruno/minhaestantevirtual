// AI-powered page OCR + book identification using Lovable AI Gateway
// Receives a photo of any internal book page, extracts text, and tries to
// identify which book it belongs to. Falls back to Open Library + Google Books.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BookCandidate {
  title: string;
  authors: string[];
  cover_url: string | null;
  description?: string | null;
  isbn?: string | null;
  source: "openlibrary" | "google";
}

async function searchOpenLibrary(query: string): Promise<BookCandidate[]> {
  try {
    const r = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`,
    );
    if (!r.ok) return [];
    const j = await r.json();
    return (j.docs || []).slice(0, 5).map((d: any) => ({
      title: d.title,
      authors: d.author_name || [],
      cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
      isbn: d.isbn?.[0] || null,
      source: "openlibrary" as const,
    }));
  } catch {
    return [];
  }
}

async function searchGoogleBooks(query: string): Promise<BookCandidate[]> {
  try {
    const r = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`,
    );
    if (!r.ok) return [];
    const j = await r.json();
    return (j.items || []).slice(0, 5).map((it: any) => {
      const v = it.volumeInfo || {};
      return {
        title: v.title,
        authors: v.authors || [],
        cover_url: v.imageLinks?.thumbnail?.replace("http://", "https://") || null,
        description: v.description || null,
        isbn: v.industryIdentifiers?.find((x: any) => x.type === "ISBN_13")?.identifier || null,
        source: "google" as const,
      };
    });
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    // STEP 1 — Vision: OCR + try to guess the book from a single page.
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é um especialista em reconhecimento de livros a partir de uma foto de uma página interna. " +
              "Faça OCR do texto visível, identifique trechos marcantes (citações, nomes próprios, primeira frase de capítulo, número de página, título de capítulo) " +
              "e tente deduzir qual livro é. Retorne APENAS um JSON válido neste formato exato, sem comentários nem markdown:\n" +
              "{\n" +
              '  "excerpt": "trecho mais marcante (até 200 chars) extraído da página",\n' +
              '  "guess": { "title": "título provável ou null", "author": "autor provável ou null" },\n' +
              '  "search_query": "melhor query para buscar este livro em catálogos (autor + título OU frase exata entre aspas)",\n' +
              '  "language": "pt|en|es|...",\n' +
              '  "confidence": 0.0-1.0\n' +
              "}",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Esta é a foto de uma página interna de um livro. Extraia o texto e identifique o livro.",
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "Limite de uso atingido. Tente novamente em instantes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos AI insuficientes." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error", t);
      return new Response(JSON.stringify({ error: "Falha na análise da página" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const content = aiJson.choices?.[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json|```/g, "").trim();

    let parsed: {
      excerpt?: string;
      guess?: { title?: string | null; author?: string | null };
      search_query?: string;
      language?: string;
      confidence?: number;
    } = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // try to extract first JSON-looking blob
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          parsed = {};
        }
      }
    }

    const excerpt = (parsed.excerpt || "").trim();
    const guessTitle = parsed.guess?.title?.trim() || null;
    const guessAuthor = parsed.guess?.author?.trim() || null;
    const confidence = parsed.confidence ?? 0;

    // STEP 2 — Build search strategies in cascade.
    const queries: string[] = [];
    if (parsed.search_query) queries.push(parsed.search_query);
    if (guessTitle && guessAuthor) queries.push(`${guessTitle} ${guessAuthor}`);
    if (guessTitle) queries.push(guessTitle);
    if (excerpt && excerpt.length >= 25) {
      // Exact phrase search (trim to first sentence-ish)
      const phrase = excerpt.replace(/\s+/g, " ").slice(0, 120);
      queries.push(`"${phrase}"`);
    }

    let candidates: BookCandidate[] = [];
    let usedQuery = "";
    for (const q of queries) {
      // Try Open Library first (faster, no key)
      const ol = await searchOpenLibrary(q);
      if (ol.length > 0) {
        candidates = ol;
        usedQuery = q;
        break;
      }
      // Then Google Books
      const gb = await searchGoogleBooks(q);
      if (gb.length > 0) {
        candidates = gb;
        usedQuery = q;
        break;
      }
    }

    return new Response(
      JSON.stringify({
        excerpt,
        guess: { title: guessTitle, author: guessAuthor },
        confidence,
        language: parsed.language || null,
        usedQuery,
        candidates,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("recognize-page error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
