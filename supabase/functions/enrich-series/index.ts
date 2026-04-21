// deno-lint-ignore-file no-explicit-any
/**
 * enrich-series — busca metadados oficiais de uma série (volumes totais,
 * status, sinopse, capa) usando uma cascata:
 *   1. Cache global (series_enrichment_cache) — se já aprendido por outro usuário
 *   2. AniList (gratuito, sem API key) — para mangá/comic
 *   3. Lovable AI Gateway (Gemini) com tool calling — fallback estruturado
 *
 * O resultado é salvo:
 *   - na linha da `series` (campos seguros via RPC ou service role)
 *   - no `series_enrichment_cache` (chave normalizada → próximos usuários
 *     que adicionarem a mesma série recebem do banco sem chamada externa).
 *
 * Body: { series_id: string, force?: boolean }
 *
 * Auth: requer JWT (usuário logado). Service role usado internamente.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function strFold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function cacheKey(title: string): string {
  return strFold(title).replace(/[^a-z0-9]+/g, "");
}

interface EnrichmentData {
  total_volumes: number | null;
  total_chapters: number | null;
  status: string | null;
  description: string | null;
  cover_url: string | null;
  banner_url: string | null;
  categories: string[];
  published_year: number | null;
  source: "anilist" | "ai" | "cache";
  source_id: string | null;
  confidence: number;
  raw: any;
}

const ANILIST_QUERY = `
query ($search: String, $type: MediaType) {
  Page(perPage: 5) {
    media(search: $search, type: $type, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
      id
      title { romaji english native }
      description(asHtml: false)
      coverImage { extraLarge large }
      bannerImage
      genres
      startDate { year }
      status
      volumes
      chapters
      averageScore
    }
  }
}`;

function statusMap(s: string | null): string | null {
  switch (s) {
    case "FINISHED": return "finished";
    case "RELEASING": return "ongoing";
    case "HIATUS": return "hiatus";
    case "CANCELLED": return "cancelled";
    case "NOT_YET_RELEASED": return "upcoming";
    default: return null;
  }
}

async function fetchAnilist(
  title: string,
  contentType: string,
  authors: string[],
): Promise<EnrichmentData | null> {
  // AniList só tem mangá; para comic/book ainda tentamos pq mtos comics estão lá
  const type = contentType === "manga" ? "MANGA" : contentType === "comic" ? "MANGA" : null;
  if (!type) return null;
  try {
    const r = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: ANILIST_QUERY,
        variables: { search: title.slice(0, 80), type },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const list: any[] = j?.data?.Page?.media || [];
    if (list.length === 0) return null;

    // Match: prefere o que mais bate em título + (se possível) autor
    const normTitle = strFold(title);
    const scored = list.map((m) => {
      const titles = [m.title?.romaji, m.title?.english, m.title?.native]
        .filter(Boolean).map(strFold);
      let score = 0;
      for (const t of titles) {
        if (t === normTitle) score += 10;
        else if (t.includes(normTitle) || normTitle.includes(t)) score += 5;
      }
      // Popularidade ajuda em desempate
      score += (m.averageScore || 0) / 100;
      return { m, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0]?.m;
    if (!best) return null;

    return {
      total_volumes: typeof best.volumes === "number" ? best.volumes : null,
      total_chapters: typeof best.chapters === "number" ? best.chapters : null,
      status: statusMap(best.status),
      description: best.description ? best.description.replace(/<[^>]*>/g, "").trim() : null,
      cover_url: best.coverImage?.extraLarge || best.coverImage?.large || null,
      banner_url: best.bannerImage || null,
      categories: best.genres || [],
      published_year: best.startDate?.year || null,
      source: "anilist",
      source_id: String(best.id),
      confidence: Math.min(1, scored[0].score / 12),
      raw: { anilist_id: best.id, score: best.averageScore },
    };
  } catch (e) {
    console.error("anilist error", e);
    return null;
  }
}

async function fetchAi(
  title: string,
  authors: string[],
  contentType: string,
): Promise<EnrichmentData | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              "Você é um especialista em catalogar mangás, quadrinhos e séries de livros. " +
              "Dado um título e autor(es), informe metadados oficiais usando a função fornecida. " +
              "Use APENAS conhecimento factual amplamente conhecido. Se não souber com certeza, retorne null no campo. " +
              "NUNCA invente número de volumes — se não tiver certeza, deixe null.",
          },
          {
            role: "user",
            content: `Título: ${title}\nAutor(es): ${authors.join(", ") || "desconhecido"}\nTipo: ${contentType}\n\nInforme: total de volumes publicados (todos no mundo), status (em curso/finalizada/etc), sinopse curta, gêneros, ano de lançamento.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_series_metadata",
              description: "Retorna metadados oficiais da série",
              parameters: {
                type: "object",
                properties: {
                  total_volumes: { type: ["integer", "null"], description: "Total de volumes publicados oficialmente. NULL se desconhecido." },
                  total_chapters: { type: ["integer", "null"] },
                  status: {
                    type: ["string", "null"],
                    enum: ["ongoing", "finished", "hiatus", "cancelled", "upcoming", null],
                  },
                  description: { type: ["string", "null"], description: "Sinopse de até 400 caracteres" },
                  categories: { type: "array", items: { type: "string" } },
                  published_year: { type: ["integer", "null"] },
                  confidence: { type: "number", description: "0-1, quão certo você está" },
                },
                required: ["total_volumes", "status", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_series_metadata" } },
      }),
    });

    if (!r.ok) {
      console.error("AI gateway error", r.status, await r.text());
      return null;
    }
    const j = await r.json();
    const tc = j.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) return null;
    const args = JSON.parse(tc.function.arguments || "{}");
    return {
      total_volumes: args.total_volumes ?? null,
      total_chapters: args.total_chapters ?? null,
      status: args.status ?? null,
      description: args.description ?? null,
      cover_url: null,
      banner_url: null,
      categories: args.categories ?? [],
      published_year: args.published_year ?? null,
      source: "ai",
      source_id: null,
      confidence: typeof args.confidence === "number" ? args.confidence : 0.5,
      raw: { ai_model: "google/gemini-2.5-flash", args },
    };
  } catch (e) {
    console.error("ai error", e);
    return null;
  }
}

// ============================================================
// Helpers de qualidade — escolhem a MELHOR capa/sinopse entre as fontes
// ============================================================

/**
 * Escolhe a melhor URL de capa entre a atual e a candidata.
 * Prefere AniList extraLarge (geralmente >800px) e capas que não sejam
 * "thumbnails" (heurística por substring no path). Se a atual já é boa,
 * mantém — exceto quando a candidata é claramente uma versão maior.
 */
function pickBetterCover(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  if (current === candidate) return current;

  const score = (url: string): number => {
    let s = 0;
    if (/anilist\.co|anili\.st/i.test(url)) s += 5;          // AniList tem capas grandes
    if (/extraLarge|large|original|2x/i.test(url)) s += 4;
    if (/thumb|small|medium|sml/i.test(url)) s -= 3;
    if (/openlibrary\.org\/b\/.*-S\.jpg/i.test(url)) s -= 4;  // tamanho S do OpenLibrary
    if (/openlibrary\.org\/b\/.*-L\.jpg/i.test(url)) s += 2;
    return s;
  };

  return score(candidate) > score(current) ? candidate : current;
}

/**
 * Escolhe a melhor descrição. Critério: a maior, desde que tenha
 * conteúdo razoável (>=80 chars). Se a atual já tem >400 chars, só
 * substitui se a candidata for >50% maior.
 */
function pickBetterDescription(current: string | null, candidate: string | null): string | null {
  const a = (current || "").trim();
  const b = (candidate || "").trim();
  if (!b) return a || null;
  if (!a) return b.length >= 40 ? b : null;
  if (b.length < 80) return a;
  if (a.length < 80) return b;
  if (a.length >= 400) return b.length > a.length * 1.5 ? b : a;
  return b.length > a.length ? b : a;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const seriesId: string | undefined = body?.series_id;
    const force: boolean = !!body?.force;
    if (!seriesId) {
      return new Response(JSON.stringify({ error: "series_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supaUrl, serviceKey);

    // Carrega série
    const { data: series, error } = await supabase
      .from("series")
      .select("id, title, authors, content_type, total_volumes, status, description, cover_url, last_enriched_at")
      .eq("id", seriesId)
      .maybeSingle();
    if (error || !series) {
      return new Response(JSON.stringify({ error: "série não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se enriquecida há menos de 7 dias e não é force, não refaz
    if (!force && series.last_enriched_at) {
      const days = (Date.now() - new Date(series.last_enriched_at).getTime()) / 86400000;
      if (days < 7 && series.total_volumes) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "recently_enriched", series }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const key = cacheKey(series.title);

    // 1) Tenta cache global
    if (!force) {
      const { data: cached } = await supabase
        .from("series_enrichment_cache")
        .select("*")
        .eq("cache_key", key)
        .eq("content_type", series.content_type)
        .maybeSingle();
      if (cached && cached.total_volumes) {
        const updates = {
          total_volumes: series.total_volumes && series.total_volumes > cached.total_volumes
            ? series.total_volumes // mantém o maior se usuário já tem mais
            : cached.total_volumes,
          status: series.status || cached.status,
          // ⬇️ fallback inteligente: pega a sinopse mais rica
          description: pickBetterDescription(series.description, cached.description),
          // ⬇️ fallback inteligente: pega a capa de maior qualidade
          cover_url: pickBetterCover(series.cover_url, cached.cover_url),
          // banner_url não existe na tabela series — fica no cache
          source: cached.source,
          source_id: cached.source_id,
          raw: cached.raw,
          last_enriched_at: new Date().toISOString(),
          enriched_by: `cache:${cached.source}`,
        };
        const { data: updated } = await supabase
          .from("series").update(updates).eq("id", seriesId).select().single();
        return new Response(
          JSON.stringify({ ok: true, from: "cache", series: updated, cached }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // 2) AniList — sempre tenta primeiro (capa grande + sinopse oficial + banner)
    let result = await fetchAnilist(series.title, series.content_type, series.authors || []);

    // 3) Fallback IA — sempre que AniList não retornou volumes
    if (!result || !result.total_volumes) {
      const aiResult = await fetchAi(series.title, series.authors || [], series.content_type);
      if (aiResult && (aiResult.total_volumes || !result)) {
        if (result) {
          // Mescla: PRESERVA capa/banner/sinopse do AniList (são oficiais e ricas),
          // só pega da IA o que faltou — principalmente total_volumes.
          result = {
            ...result,
            total_volumes: result.total_volumes ?? aiResult.total_volumes,
            total_chapters: result.total_chapters ?? aiResult.total_chapters,
            status: result.status ?? aiResult.status,
            description: pickBetterDescription(result.description, aiResult.description),
            categories: result.categories.length ? result.categories : aiResult.categories,
            published_year: result.published_year ?? aiResult.published_year,
            confidence: Math.max(result.confidence, aiResult.confidence),
            source: aiResult.total_volumes && !result.total_volumes ? "ai" : result.source,
            raw: { ...result.raw, ai: aiResult.raw },
          };
        } else {
          result = aiResult;
        }
      }
    }

    if (!result) {
      return new Response(
        JSON.stringify({ ok: false, reason: "no_metadata_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Atualiza série (preserva valores manuais maiores)
    const finalTotal = series.total_volumes && result.total_volumes && series.total_volumes > result.total_volumes
      ? series.total_volumes
      : result.total_volumes;
    const updates: any = {
      total_volumes: finalTotal,
      status: series.status || result.status,
      // ⬇️ fallback inteligente: usa a sinopse mais rica
      description: pickBetterDescription(series.description, result.description),
      // ⬇️ fallback inteligente: prefere capa grande do AniList sobre thumbnails
      cover_url: pickBetterCover(series.cover_url, result.cover_url),
      // banner_url só vai pro cache global — não há coluna na tabela series
      source: result.source,
      source_id: result.source_id,
      raw: result.raw,
      last_enriched_at: new Date().toISOString(),
      enriched_by: result.source,
    };
    const { data: updated, error: upErr } = await supabase
      .from("series").update(updates).eq("id", seriesId).select().single();
    if (upErr) {
      console.error("update series failed", upErr);
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Salva no cache global (upsert) — apenas se confiança razoável
    if (result.confidence >= 0.5 && result.total_volumes) {
      await supabase.from("series_enrichment_cache").upsert({
        cache_key: key,
        content_type: series.content_type,
        title: series.title,
        authors: series.authors || [],
        total_volumes: result.total_volumes,
        total_chapters: result.total_chapters,
        status: result.status,
        description: result.description,
        cover_url: result.cover_url,
        banner_url: result.banner_url,
        categories: result.categories,
        published_year: result.published_year,
        source: result.source,
        source_id: result.source_id,
        raw: result.raw,
        confidence: result.confidence,
      }, { onConflict: "cache_key,content_type" });
    }

    return new Response(
      JSON.stringify({ ok: true, from: result.source, series: updated, enrichment: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("enrich-series error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
