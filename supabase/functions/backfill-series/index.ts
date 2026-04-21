// deno-lint-ignore-file no-explicit-any
/**
 * backfill-series — worker em background que processa series_backfill_queue.
 *
 * Para cada livro pendente:
 *  1. Normaliza o título (vol., #, vol.., :: etc.)
 *  2. Busca série existente compatível (mesmo content_type + chave normalizada)
 *     - Se autor existe: tenta também casar por autor.
 *     - Se autor vazio: casa apenas por (content_type + chave) — não deixa órfão.
 *  3. Se nenhuma série existe e há ≥ 1 outro livro pendente OU já existente
 *     com a mesma chave → cria série nova e linka todos.
 *  4. Se ainda não há agrupamento possível → marca skipped (volta a tentar
 *     depois de 1h, dando tempo p/ chegarem outros volumes da série).
 *
 * Sem JWT (chamado via cron pg_net). Idempotente.
 *
 * Body opcional: { limit?: number }  (default 100)
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- Normalização (espelha src/lib/series-normalize.ts) ----------
const VOL_KEYWORDS =
  "vol(?:ume|\\.+)?|tome|tomo|book|livro|capitulo|chapter|cap\\.*|n[º°o]?\\.*|#";

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
  t = t.replace(/\.{2,}/g, ".").replace(/:{2,}/g, ":").replace(/\s+/g, " ").trim();
  let detectedVol: number | null = null;
  const volKwRe = new RegExp(
    `(?:^|[\\s\\-:,.])(?:${VOL_KEYWORDS})\\s*(\\d{1,3})(?!\\d)`,
    "i",
  );
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
  const trailingKwRe = new RegExp(`[\\s\\-:,.]+(?:${VOL_KEYWORDS})\\s*$`, "i");
  t = t.replace(trailingKwRe, " ");
  t = t.replace(/[\s\-:,.\u2013\u2014]+$/g, "").trim().replace(/\s+/g, " ");
  const key = t.replace(/[^a-z0-9]+/g, "");
  return { base: t, volume: detectedVol, key };
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
function capitalizeAuthor(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

async function fetchAnilistTotal(
  title: string,
  signal: AbortSignal,
): Promise<number | null> {
  try {
    const r = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal,
      body: JSON.stringify({
        query:
          `query ($search: String) { Media(search: $search, type: MANGA, format: MANGA) { volumes } }`,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supaUrl, serviceKey);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const limit = Math.min(
      Number.isFinite(body?.limit) ? body.limit : 100,
      500,
    );

    // 1) Pega lote pendente
    const { data: queueRows, error: qErr } = await supabase
      .from("series_backfill_queue")
      .select("id, book_id, attempts")
      .eq("status", "pending")
      .lte("next_attempt_at", new Date().toISOString())
      .order("enqueued_at", { ascending: true })
      .limit(limit);

    if (qErr) {
      console.error("queue fetch failed", qErr);
      return new Response(
        JSON.stringify({ error: qErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!queueRows || queueRows.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "queue empty" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Marca como processing (lock leve)
    const queueIds = queueRows.map((r) => r.id);
    await supabase
      .from("series_backfill_queue")
      .update({ status: "processing" })
      .in("id", queueIds);

    // 2) Carrega livros associados
    const bookIds = queueRows.map((r) => r.book_id);
    const { data: books, error: bErr } = await supabase
      .from("books")
      .select("id,title,authors,content_type,series_id,volume_number")
      .in("id", bookIds);

    if (bErr || !books) {
      // devolve pra pendente
      await supabase
        .from("series_backfill_queue")
        .update({
          status: "pending",
          last_error: bErr?.message ?? "books fetch failed",
        })
        .in("id", queueIds);
      return new Response(
        JSON.stringify({ error: bErr?.message ?? "books fetch failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const queueByBook = new Map(queueRows.map((q) => [q.book_id, q]));
    const stats = {
      processed: 0,
      linked_existing: 0,
      created_series: 0,
      skipped: 0,
      errors: 0,
    };

    // 3) Para cada livro, tenta resolver a série
    for (const b of books) {
      const qRow = queueByBook.get(b.id);
      if (!qRow) continue;
      stats.processed++;

      try {
        // já tem série? (corrida com outro processo) → done
        if (b.series_id) {
          await supabase
            .from("series_backfill_queue")
            .update({
              status: "done",
              processed_at: new Date().toISOString(),
              matched_series_id: b.series_id,
            })
            .eq("id", qRow.id);
          continue;
        }

        const norm = normalizeSeriesTitle(b.title);
        if (!norm.key || norm.key.length < 3) {
          await supabase
            .from("series_backfill_queue")
            .update({
              status: "skipped",
              processed_at: new Date().toISOString(),
              last_error: "title key too short",
            })
            .eq("id", qRow.id);
          stats.skipped++;
          continue;
        }

        const author = (b.authors?.[0] || "").trim().toLowerCase();
        const noAuthor = !author;
        const ct = b.content_type;

        // 3a) Procura série existente compatível (mesmo content_type)
        const { data: candidates } = await supabase
          .from("series")
          .select("id,title,authors,content_type,total_volumes")
          .eq("content_type", ct)
          .limit(200);

        let targetSeriesId: string | null = null;
        for (const s of candidates ?? []) {
          const sNorm = normalizeSeriesTitle(s.title).key;
          if (sNorm !== norm.key) continue;
          // se ambos têm autor, autor precisa bater (case-insensitive, primeiro autor)
          if (!noAuthor && s.authors && s.authors.length > 0) {
            const sAuthor = (s.authors[0] || "").toLowerCase();
            if (sAuthor && sAuthor !== author) continue;
          }
          targetSeriesId = s.id;
          break;
        }

        if (targetSeriesId) {
          // linka direto
          const { error: uErr } = await supabase
            .from("books")
            .update({
              series_id: targetSeriesId,
              volume_number: norm.volume ?? b.volume_number ?? null,
            })
            .eq("id", b.id);
          if (uErr) throw uErr;

          await supabase
            .from("series_backfill_queue")
            .update({
              status: "done",
              processed_at: new Date().toISOString(),
              matched_series_id: targetSeriesId,
            })
            .eq("id", qRow.id);
          stats.linked_existing++;
          continue;
        }

        // 3b) Sem série existente → procura outros livros com a mesma chave
        // (busca livros do MESMO content_type cujo título normalizado bata)
        const { data: peers } = await supabase
          .from("books")
          .select("id,title,authors,content_type,series_id,volume_number")
          .eq("content_type", ct)
          .ilike("title", `%${norm.base.split(" ")[0] || norm.base}%`)
          .limit(50);

        const matchingPeers = (peers ?? []).filter((p) => {
          if (p.id === b.id) return false;
          const pNorm = normalizeSeriesTitle(p.title);
          if (pNorm.key !== norm.key) return false;
          if (!noAuthor && p.authors?.length) {
            const pAuthor = (p.authors[0] || "").toLowerCase();
            if (pAuthor && pAuthor !== author) return false;
          }
          return true;
        });

        // Se peer já tem série → linka nessa
        const peerWithSeries = matchingPeers.find((p) => p.series_id);
        if (peerWithSeries) {
          await supabase
            .from("books")
            .update({
              series_id: peerWithSeries.series_id,
              volume_number: norm.volume ?? b.volume_number ?? null,
            })
            .eq("id", b.id);

          await supabase
            .from("series_backfill_queue")
            .update({
              status: "done",
              processed_at: new Date().toISOString(),
              matched_series_id: peerWithSeries.series_id,
            })
            .eq("id", qRow.id);
          stats.linked_existing++;
          continue;
        }

        // Se há ≥ 1 peer, GUARD: não criar série de duplicatas do mesmo livro.
        // Critério (espelha consolidate-series): pelo menos 2 volume_numbers distintos
        // OU todos os títulos originais (após fold) precisam ser distintos.
        if (matchingPeers.length >= 1) {
          const groupAll = [b, ...matchingPeers];
          const distinctVols = new Set(
            groupAll
              .map((p) => normalizeSeriesTitle(p.title).volume ?? p.volume_number)
              .filter((v): v is number => Number.isFinite(v as number)),
          );
          const distinctTitles = new Set(groupAll.map((p) => strFold(p.title)));
          const hasMultipleDistinctVols = distinctVols.size >= 2;
          const allTitlesDistinct =
            distinctTitles.size >= 2 && distinctTitles.size === groupAll.length;
          if (!hasMultipleDistinctVols && !allTitlesDistinct) {
            // são duplicatas do mesmo livro → NÃO é série, marca skipped permanente
            await supabase
              .from("series_backfill_queue")
              .update({
                status: "skipped",
                processed_at: new Date().toISOString(),
                last_error: "duplicates of same book, not a series",
              })
              .eq("id", qRow.id);
            stats.skipped++;
            continue;
          }
          let totalVols: number | null = null;
          if (ct === "manga") {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 4000);
            totalVols = await fetchAnilistTotal(norm.base, ctrl.signal);
            clearTimeout(t);
          }

          const { data: created, error: cErr } = await supabase
            .from("series")
            .insert({
              title: titleCase(norm.base),
              authors: noAuthor ? [] : [capitalizeAuthor(author)],
              content_type: ct,
              total_volumes: totalVols,
              source: "backfill-series",
              source_id: `${ct}::${noAuthor ? "_noauthor_" : author}::${norm.key}`,
            })
            .select("id")
            .single();
          if (cErr || !created) throw cErr ?? new Error("create series failed");

          const allIds = [b.id, ...matchingPeers.map((p) => p.id)];
          // Atualiza cada um (volume_number distinto por livro)
          for (const peer of [b, ...matchingPeers]) {
            const peerNorm = normalizeSeriesTitle(peer.title);
            await supabase
              .from("books")
              .update({
                series_id: created.id,
                volume_number: peerNorm.volume ?? peer.volume_number ?? null,
              })
              .eq("id", peer.id);
          }

          // Marca todos os itens correspondentes na fila como done
          await supabase
            .from("series_backfill_queue")
            .update({
              status: "done",
              processed_at: new Date().toISOString(),
              matched_series_id: created.id,
            })
            .in("book_id", allIds)
            .in("status", ["pending", "processing"]);

          stats.created_series++;
          continue;
        }

        // 3c) Nenhum peer ainda → adia 1h (talvez chegue outro volume depois)
        const nextAttempt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const newAttempts = (qRow.attempts ?? 0) + 1;
        // após 5 tentativas (~5h), marca skipped definitivo
        await supabase
          .from("series_backfill_queue")
          .update({
            status: newAttempts >= 5 ? "skipped" : "pending",
            attempts: newAttempts,
            next_attempt_at: nextAttempt,
            last_error: "no peers yet",
          })
          .eq("id", qRow.id);
        stats.skipped++;
      } catch (e) {
        console.error("backfill book failed", b.id, e);
        const newAttempts = (qRow.attempts ?? 0) + 1;
        await supabase
          .from("series_backfill_queue")
          .update({
            status: newAttempts >= 3 ? "error" : "pending",
            attempts: newAttempts,
            next_attempt_at: new Date(
              Date.now() + 5 * 60 * 1000,
            ).toISOString(),
            last_error: e instanceof Error ? e.message : String(e),
          })
          .eq("id", qRow.id);
        stats.errors++;
      }
    }

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("backfill-series error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
