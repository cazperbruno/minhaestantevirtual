// supabase/functions/club-report-pdf/index.ts
// Gera relatório do clube em PDF (usa jsPDF via esm.sh)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// @ts-ignore - esm.sh resolves types
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProgressRow {
  book_id: string | null;
  page_count: number | null;
  total_members: number;
  reading_count: number;
  finished_count: number;
  avg_progress: number | null;
  total_pages_read: number;
}

interface RankRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  pages_read: number;
  messages_count: number;
  reactions_received: number;
  total_points: number;
  level: number;
  achievements: string[] | null;
}

interface Report {
  club: { id: string; name: string; description: string | null; members_count: number; created_at: string };
  current_book: { id: string; title: string; authors: string[]; page_count: number | null; cover_url?: string | null } | null;
  progress: ProgressRow | null;
  weekly: { week_start: string; messages: number; active_users: number }[];
  ranking: RankRow[];
  generated_at: string;
}

/** Baixa uma imagem e converte para base64 (PNG/JPEG) para o jsPDF. */
async function fetchImageAsBase64(url: string): Promise<{ data: string; format: "JPEG" | "PNG" } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    const format: "JPEG" | "PNG" = ct.includes("png") ? "PNG" : "JPEG";
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return { data: btoa(bin), format };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = await req.json().catch(() => ({}));
    const clubId = body?.club_id as string | undefined;
    if (!clubId) {
      return new Response(JSON.stringify({ error: "club_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.rpc("club_report_data", { _club_id: clubId });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const report = data as Report;

    // ---------- PDF ----------
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    const line = (text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
      const { size = 11, bold = false, color = [33, 37, 41] } = opts;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
      ensureSpace(size * lines.length * 1.2);
      doc.text(lines, margin, y);
      y += size * lines.length * 1.2;
    };

    /** Trunca texto até caber em maxWidth, adicionando "…" se cortar. */
    const truncate = (text: string, maxWidth: number, fontSize = 11): string => {
      doc.setFontSize(fontSize);
      if (doc.getTextWidth(text) <= maxWidth) return text;
      const ellipsis = "…";
      let lo = 0, hi = text.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (doc.getTextWidth(text.slice(0, mid) + ellipsis) <= maxWidth) lo = mid;
        else hi = mid - 1;
      }
      return text.slice(0, lo) + ellipsis;
    };

    const hr = () => {
      ensureSpace(10);
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y, pageWidth - margin, y);
      y += 14;
    };

    // Header
    doc.setFillColor(245, 158, 11); // amber/primary tone
    doc.rect(0, 0, pageWidth, 70, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Relatório do Clube de Leitura", margin, 32);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const genDate = new Date(report.generated_at).toLocaleString("pt-BR");
    doc.text(`Gerado em ${genDate}`, margin, 52);
    y = 90;

    // Club info
    line(report.club.name, { size: 18, bold: true });
    if (report.club.description) line(report.club.description, { size: 11, color: [90, 90, 90] });
    line(`${report.club.members_count} membro(s)`, { size: 10, color: [120, 120, 120] });
    hr();

    // Current book
    if (report.current_book) {
      // Tenta embutir a capa
      const cover = report.current_book.cover_url
        ? await fetchImageAsBase64(report.current_book.cover_url)
        : null;

      const coverW = 70;
      const coverH = 100;
      const startY = y;

      if (cover) {
        try {
          ensureSpace(coverH + 8);
          doc.addImage(`data:image/${cover.format.toLowerCase()};base64,${cover.data}`, cover.format, margin, y, coverW, coverH);
        } catch (e) {
          console.warn("cover embed failed", e);
        }
      }

      const textX = cover ? margin + coverW + 14 : margin;
      const savedMargin = margin;
      // desenha texto ao lado da capa sem alterar margem global
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(33, 37, 41);
      doc.text("Livro do mês", textX, y + 14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      const titleLines = doc.splitTextToSize(report.current_book.title, pageWidth - textX - savedMargin);
      doc.text(titleLines, textX, y + 32);
      const authors = (report.current_book.authors || []).join(", ");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      let textY = y + 32 + titleLines.length * 14;
      if (authors) {
        doc.text(authors, textX, textY);
        textY += 14;
      }
      if (report.current_book.page_count) {
        doc.text(`${report.current_book.page_count} páginas`, textX, textY);
        textY += 14;
      }
      // avança y abaixo da capa ou do bloco de texto, o que for maior
      y = Math.max(startY + (cover ? coverH : 0), textY) + 10;
      doc.setTextColor(33, 37, 41);
    } else {
      line("Livro do mês: não definido", { size: 11, color: [120, 120, 120] });
      y += 8;
    }

    // Progress
    line("Progresso coletivo", { size: 13, bold: true });
    if (report.progress) {
      const p = report.progress;
      const pct = p.avg_progress != null ? `${Number(p.avg_progress).toFixed(1)}%` : "—";
      line(`Progresso médio: ${pct}`, { size: 11 });
      line(`Lendo agora: ${p.reading_count} de ${p.total_members}`, { size: 11 });
      line(`Já terminaram: ${p.finished_count}`, { size: 11 });
      line(`Total de páginas lidas: ${p.total_pages_read.toLocaleString("pt-BR")}`, { size: 11 });

      // barra de progresso
      if (p.avg_progress != null) {
        ensureSpace(20);
        const barWidth = pageWidth - margin * 2;
        doc.setFillColor(230, 230, 230);
        doc.rect(margin, y, barWidth, 8, "F");
        doc.setFillColor(245, 158, 11);
        doc.rect(margin, y, (barWidth * Math.min(100, Number(p.avg_progress))) / 100, 8, "F");
        y += 18;
      }
    } else {
      line("Sem dados de progresso ainda.", { size: 10, color: [120, 120, 120] });
    }
    hr();

    // Weekly evolution
    line("Evolução semanal (últimas 6 semanas)", { size: 13, bold: true });
    if (report.weekly && report.weekly.length > 0) {
      // tabela simples
      const colW = [pageWidth - margin * 2 - 200, 100, 100];
      ensureSpace(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text("Semana", margin, y);
      doc.text("Mensagens", margin + colW[0], y);
      doc.text("Ativos", margin + colW[0] + colW[1], y);
      y += 14;
      doc.setDrawColor(230, 230, 230);
      doc.line(margin, y - 4, pageWidth - margin, y - 4);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(33, 37, 41);
      for (const w of report.weekly) {
        ensureSpace(16);
        const dt = new Date(w.week_start).toLocaleDateString("pt-BR");
        doc.text(dt, margin, y);
        doc.text(String(w.messages), margin + colW[0], y);
        doc.text(String(w.active_users), margin + colW[0] + colW[1], y);
        y += 14;
      }
    } else {
      line("Sem atividade nas últimas 6 semanas.", { size: 10, color: [120, 120, 120] });
    }
    hr();

    // Ranking
    line("Top 10 do ranking", { size: 13, bold: true });
    if (report.ranking && report.ranking.length > 0) {
      const colW2 = [30, 220, 60, 60, 70];
      ensureSpace(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      let cx = margin;
      doc.text("#", cx, y);
      cx += colW2[0];
      doc.text("Membro", cx, y);
      cx += colW2[1];
      doc.text("Páginas", cx, y);
      cx += colW2[2];
      doc.text("Nível", cx, y);
      cx += colW2[3];
      doc.text("Pontos", cx, y);
      y += 14;
      doc.line(margin, y - 4, pageWidth - margin, y - 4);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(33, 37, 41);
      doc.setFontSize(10);
      report.ranking.forEach((r, i) => {
        ensureSpace(18);
        // zebra
        if (i % 2 === 1) {
          doc.setFillColor(248, 248, 250);
          doc.rect(margin - 2, y - 10, pageWidth - margin * 2 + 4, 16, "F");
        }
        let cx2 = margin;
        const rank = i + 1;
        if (i < 3) {
          // medalha colorida
          const colors: [number, number, number][] = [
            [212, 175, 55],   // ouro
            [176, 176, 176],  // prata
            [184, 115, 51],   // bronze
          ];
          const c = colors[i];
          doc.setFillColor(c[0], c[1], c[2]);
          doc.circle(cx2 + 6, y - 3, 7, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.text(String(rank), cx2 + 6, y, { align: "center" });
          doc.setFont("helvetica", "normal");
          doc.setTextColor(33, 37, 41);
        } else {
          doc.text(String(rank), cx2, y);
        }
        cx2 += colW2[0];
        const name = r.display_name || r.username || "Leitor";
        doc.text(truncate(name, colW2[1] - 4, 10), cx2, y);
        cx2 += colW2[1];
        doc.text(String(r.pages_read), cx2, y);
        cx2 += colW2[2];
        doc.text(String(r.level), cx2, y);
        cx2 += colW2[3];
        doc.text(String(r.total_points), cx2, y);
        y += 16;
      });
    } else {
      line("Ainda sem ranking.", { size: 10, color: [120, 120, 120] });
    }

    // Footer (página)
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(160, 160, 160);
      doc.text(
        `Readify · página ${i}/${pageCount}`,
        pageWidth / 2,
        pageHeight - 20,
        { align: "center" },
      );
    }

    const arrayBuffer = doc.output("arraybuffer");
    const safeName = report.club.name.replace(/[^a-z0-9-_ ]/gi, "_").trim() || "clube";

    return new Response(arrayBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="relatorio-${safeName}.pdf"`,
      },
    });
  } catch (e) {
    console.error("club-report-pdf error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
