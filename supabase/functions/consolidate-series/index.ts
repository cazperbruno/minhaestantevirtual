// deno-lint-ignore-file no-explicit-any
/**
 * consolidate-series — agrupa livros existentes em séries.
 *
 * Estratégia equilibrada (escolha do usuário):
 *  1. Normaliza títulos: remove "vol.", números, sufixos
 *  2. Agrupa por (autor[0] + título base normalizado)
 *  3. Para grupos com ≥ 2 livros do mesmo autor:
 *     - se já existe séries com esse título base → reusa
 *     - senão cria nova série (content_type herdado do primeiro livro)
 *  4. Atualiza books.series_id + books.volume_number quando detectado
 *  5. Tenta enriquecer total_volumes via AniList quando content_type=manga
 *
 * Restrito a admins (RLS + check explícito).
 *
 * Body opcional: { dryRun?: boolean, limit?: number, scope?: "all" | "manga" }
 *
 * Retorna: { groups, created_series, updated_books, sample }
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- Normalização (espelha src/lib/series-normalize.ts) ----------
const VOL_KEYWORDS = "vol(?:ume|\\.)?|tome|tomo|book|livro|capitulo|chapter|cap\\.?|n[º°o]?\\.?|#";

function strFold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

interface NormalizedTitle {
  base: string;
  volume: number | null;
  key: string;
}

function normalizeSeriesTitle(rawTitle: string): NormalizedTitle {
  if (!rawTitle) return { base: "", volume: null, key: "" };
  let t = strFold(rawTitle);
  t = t.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  let detectedVol: number | null = null;
  const volKwRe = new RegExp(`(?:^|[\\s\\-:,.])(?:${VOL_KEYWORDS})\\s*(\\d{1,3})(?!\\d)`, "i");
  const mKw = t.match(volKwRe);
  if (mKw) {
    detectedVol = parseInt(mKw[1], 10);
    t = t.replace(mKw[0], " ").trim();
  } else {
    const mTail = t.match(/^(.+?\b[a-zA-Z][a-zA-Z\s]+)\s+(\d{1,3})\s*$/);
    if (mTail && mTail[2]) {
      detectedVol = parseInt(mTail[2], 10);
      t = mTail[1];
    }
  }
  t = t.replace(/[\s\-:,.\u2013\u2014]+$/g, "").trim().replace(/\s+/g, " ");
  const key = t.replace(/[^a-z0-9]+/g, "");
  return { base: t, volume: detectedVol, key };
}

// ---------- AniList enrichment (best effort) ----------
async function fetchAnilistTotal(title: string, signal: AbortSignal): Promise<number | null> {
  try {
    const r = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal,
      body: JSON.stringify({
        query: `query ($search: String) {
          Media(search: $search, type: MANGA, format: MANGA) {
            volumes
          }
        }`,
        variables: { search: title.slice(0, 80) },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const vol = j?.data?.Media?.volumes;
    return Number.isFinite(vol) && vol > 0 ? vol : null;
  } catch {
    return null;
  }
}

// ---------- Main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supaUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supaUrl, serviceKey);

    // Admin gate
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const dryRun = body?.dryRun === true;
    const scope = body?.scope === "manga" ? "manga" : "all";
    const limit = Math.min(Number.isFinite(body?.limit) ? body.limit : 1000, 5000);

    // 1) carrega livros sem série + agrupáveis
    let q = supabase
      .from("books")
      .select("id,title,authors,content_type,series_id,volume_number")
      .is("series_id", null)
      .limit(limit);
    if (scope === "manga") q = q.eq("content_type", "manga");
    const { data: books, error: bErr } = await q;
    if (bErr) {
      return new Response(JSON.stringify({ error: bErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) agrupa por (autor[0] + chave normalizada)
    type Group = {
      key: string;
      author: string;
      base: string;
      content_type: string;
      books: Array<{ id: string; title: string; volume: number | null }>;
    };
    const groups = new Map<string, Group>();

    for (const b of books ?? []) {
      const author = (b.authors?.[0] || "").trim().toLowerCase();
      if (!author || !b.title) continue;
      const norm = normalizeSeriesTitle(b.title);
      if (!norm.key || norm.key.length < 3) continue;

      // chave inclui autor + content_type para evitar colisão entre formatos
      const groupKey = `${author}::${b.content_type}::${norm.key}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          author,
          base: norm.base,
          content_type: b.content_type,
          books: [],
        });
      }
      groups.get(groupKey)!.books.push({
        id: b.id,
        title: b.title,
        volume: norm.volume ?? b.volume_number ?? null,
      });
    }

    // 3) só grupos com ≥ 2 livros viram série E precisam ter volumes distintos
    //    (evita falso-positivo: 2 cópias do mesmo livro NÃO é série).
    //    Critério: pelo menos 2 livros do grupo devem ter volume_number detectado distinto,
    //    OU os títulos originais (após fold) devem ser todos diferentes.
    const eligible = [...groups.values()].filter((g) => {
      if (g.books.length < 2) return false;
      const distinctVols = new Set(
        g.books.map((b) => b.volume).filter((v): v is number => Number.isFinite(v as number)),
      );
      if (distinctVols.size >= 2) return true;
      const distinctTitles = new Set(g.books.map((b) => strFold(b.title)));
      // se todos os títulos são iguais → são duplicatas, não série
      return distinctTitles.size >= 2 && distinctTitles.size === g.books.length;
    });

    const results = {
      groups_total: groups.size,
      eligible_groups: eligible.length,
      created_series: 0,
      reused_series: 0,
      updated_books: 0,
      enriched_total_volumes: 0,
      sample: [] as any[],
    };

    if (dryRun) {
      results.sample = eligible.slice(0, 20).map((g) => ({
        author: g.author,
        title: g.base,
        content_type: g.content_type,
        books: g.books.length,
        sample_volumes: g.books.slice(0, 5).map((b) => `${b.title}${b.volume ? ` [#${b.volume}]` : ""}`),
      }));
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) aplica: cria/reusa série + linka livros
    for (const g of eligible) {
      // procura série existente com mesmo author + título base normalizado
      const { data: existingList } = await supabase
        .from("series")
        .select("id,title,authors,content_type,total_volumes")
        .eq("content_type", g.content_type)
        .contains("authors", [g.books[0]?.title ? capitalizeAuthor(g.author) : g.author])
        .limit(20);

      const matched = (existingList ?? []).find((s: any) => {
        const sNorm = normalizeSeriesTitle(s.title).key;
        return sNorm === g.key.split("::")[2];
      });

      let seriesId: string;
      if (matched) {
        seriesId = matched.id;
        results.reused_series++;
      } else {
        // tenta enriquecer total_volumes via AniList p/ mangás
        let totalVols: number | null = null;
        if (g.content_type === "manga") {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 4000);
          totalVols = await fetchAnilistTotal(g.base, ctrl.signal);
          clearTimeout(t);
          if (totalVols) results.enriched_total_volumes++;
        }
        const { data: created, error: cErr } = await supabase
          .from("series")
          .insert({
            title: titleCase(g.base),
            authors: [capitalizeAuthor(g.author)],
            content_type: g.content_type,
            total_volumes: totalVols,
            source: "consolidate-series",
            source_id: g.key,
          })
          .select("id")
          .single();
        if (cErr || !created) {
          console.warn(`create series failed for ${g.base}:`, cErr?.message);
          continue;
        }
        seriesId = created.id;
        results.created_series++;
      }

      // atualiza books em batch
      for (const b of g.books) {
        const { error: uErr } = await supabase
          .from("books")
          .update({
            series_id: seriesId,
            volume_number: b.volume ?? undefined,
          })
          .eq("id", b.id);
        if (!uErr) results.updated_books++;
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("consolidate-series error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
function capitalizeAuthor(s: string): string {
  return s.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
