import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Download, Filter, FileText, BookOpen, Star, Layers, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AffiliateClicksPanel } from "@/components/reports/AffiliateClicksPanel";
import { useIsAdmin } from "@/hooks/useIsAdmin";

type Row = {
  id: string;
  status: string;
  rating: number | null;
  started_at: string | null;
  finished_at: string | null;
  current_page: number | null;
  book: {
    id: string;
    title: string;
    authors: string[];
    categories: string[] | null;
    page_count: number | null;
    published_year: number | null;
  } | null;
};

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os status" },
  { value: "read", label: "Lidos" },
  { value: "reading", label: "Lendo" },
  { value: "wishlist", label: "Lista de desejos" },
  { value: "not_read", label: "Não lidos" },
];

const PERIOD_OPTIONS = [
  { value: "all", label: "Sempre" },
  { value: "ytd", label: "Este ano" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "custom", label: "Personalizado" },
];

export default function ReportsPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("ytd");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [author, setAuthor] = useState("all");
  const [category, setCategory] = useState("all");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_books")
        .select(
          "id,status,rating,started_at,finished_at,current_page,book:books(id,title,authors,categories,page_count,published_year)"
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) {
        toast.error("Erro ao carregar dados");
      } else {
        setRows((data || []) as any);
      }
      setLoading(false);
    })();
  }, [user]);

  const periodRange = useMemo(() => {
    const now = new Date();
    if (period === "all") return null;
    if (period === "ytd") return { from: new Date(now.getFullYear(), 0, 1), to: now };
    if (period === "12m") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 12);
      return { from: d, to: now };
    }
    if (period === "30d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { from: d, to: now };
    }
    if (period === "custom") {
      return {
        from: from ? new Date(from) : new Date(0),
        to: to ? new Date(to + "T23:59:59") : now,
      };
    }
    return null;
  }, [period, from, to]);

  const authorOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.book?.authors?.forEach((a) => a && set.add(a)));
    return Array.from(set).sort();
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.book?.categories?.forEach((c) => c && set.add(c)));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!r.book) return false;
      if (status !== "all" && r.status !== status) return false;
      if (author !== "all" && !r.book.authors?.includes(author)) return false;
      if (category !== "all" && !r.book.categories?.includes(category)) return false;
      if (periodRange) {
        const ref = r.finished_at || r.started_at;
        if (!ref) return false;
        const d = new Date(ref);
        if (d < periodRange.from || d > periodRange.to) return false;
      }
      return true;
    });
  }, [rows, status, author, category, periodRange]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const ratings = filtered.map((r) => r.rating).filter((x): x is number => !!x);
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const pages = filtered.reduce((acc, r) => {
      if (r.status === "read") return acc + (r.book?.page_count || 0);
      return acc + (r.current_page || 0);
    }, 0);
    const genreCount = new Map<string, number>();
    filtered.forEach((r) => r.book?.categories?.forEach((c) => genreCount.set(c, (genreCount.get(c) || 0) + 1)));
    const topGenres = Array.from(genreCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const authorCount = new Map<string, number>();
    filtered.forEach((r) => r.book?.authors?.forEach((a) => authorCount.set(a, (authorCount.get(a) || 0) + 1)));
    const topAuthors = Array.from(authorCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { total, avgRating, pages, topGenres, topAuthors };
  }, [filtered]);

  const periodLabel = useMemo(() => {
    if (!periodRange) return "Todo o período";
    return `${format(periodRange.from, "dd/MM/yyyy", { locale: ptBR })} – ${format(
      periodRange.to,
      "dd/MM/yyyy",
      { locale: ptBR }
    )}`;
  }, [periodRange]);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = (autoTableModule as any).default || autoTableModule;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 40;

      // Header
      doc.setFillColor(218, 165, 32);
      doc.rect(0, 0, pageWidth, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(20, 20, 20);
      doc.text("Relatório de Leitura", margin, 50);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(110, 110, 110);
      doc.text(
        `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
        margin,
        66
      );
      doc.text(`Período: ${periodLabel}`, margin, 80);

      // Filters summary
      const filters: string[] = [];
      filters.push(`Status: ${STATUS_OPTIONS.find((s) => s.value === status)?.label}`);
      if (author !== "all") filters.push(`Autor: ${author}`);
      if (category !== "all") filters.push(`Categoria: ${category}`);
      doc.text(filters.join("  •  "), margin, 94);

      // Stats grid
      let y = 120;
      doc.setDrawColor(230, 230, 230);
      doc.setFillColor(248, 246, 240);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 70, 6, 6, "FD");
      const cellW = (pageWidth - margin * 2) / 4;
      const cells = [
        { label: "Livros", value: String(stats.total) },
        { label: "Média rating", value: stats.avgRating ? stats.avgRating.toFixed(1) : "—" },
        { label: "Páginas", value: stats.pages.toLocaleString("pt-BR") },
        { label: "Gêneros", value: String(stats.topGenres.length) },
      ];
      cells.forEach((c, i) => {
        const cx = margin + cellW * i + cellW / 2;
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(c.label.toUpperCase(), cx, y + 26, { align: "center" });
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 30);
        doc.text(c.value, cx, y + 52, { align: "center" });
        doc.setFont("helvetica", "normal");
      });
      y += 90;

      // Top lists
      if (stats.topGenres.length || stats.topAuthors.length) {
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40, 40, 40);
        doc.text("Top gêneros", margin, y);
        doc.text("Top autores", margin + (pageWidth - margin * 2) / 2 + 10, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(70, 70, 70);
        const colY = y + 14;
        stats.topGenres.forEach((g, i) => {
          doc.text(`${i + 1}. ${g[0]} — ${g[1]}`, margin, colY + i * 14);
        });
        stats.topAuthors.forEach((a, i) => {
          doc.text(
            `${i + 1}. ${a[0]} — ${a[1]}`,
            margin + (pageWidth - margin * 2) / 2 + 10,
            colY + i * 14
          );
        });
        y = colY + Math.max(stats.topGenres.length, stats.topAuthors.length) * 14 + 16;
      }

      // Table
      autoTable(doc, {
        startY: y,
        head: [["#", "Título", "Autor", "Status", "Rating", "Páginas", "Concluído"]],
        body: filtered.map((r, i) => [
          String(i + 1),
          r.book?.title || "—",
          (r.book?.authors || []).join(", ") || "—",
          STATUS_OPTIONS.find((s) => s.value === r.status)?.label || r.status,
          r.rating ? `${r.rating}/5` : "—",
          r.book?.page_count ? String(r.book.page_count) : "—",
          r.finished_at ? format(new Date(r.finished_at), "dd/MM/yyyy") : "—",
        ]),
        styles: { fontSize: 9, cellPadding: 6, textColor: [40, 40, 40] },
        headStyles: { fillColor: [30, 30, 30], textColor: [240, 220, 170], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 248, 244] },
        columnStyles: {
          0: { cellWidth: 26, halign: "right" },
          4: { halign: "center" },
          5: { halign: "right" },
          6: { halign: "center" },
        },
        margin: { left: margin, right: margin },
        didDrawPage: (data: any) => {
          const pageCount = doc.getNumberOfPages();
          const pageNum = data.pageNumber;
          doc.setFontSize(9);
          doc.setTextColor(140, 140, 140);
          doc.text(
            `Página ${pageNum} de ${pageCount}  •  Página — sua biblioteca pessoal`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 18,
            { align: "center" }
          );
        },
      });

      doc.save(`relatorio-leitura-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("PDF exportado");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao exportar PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> Relatórios
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              Sua leitura, em <span className="text-gradient-gold">números</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Filtre, visualize e exporte um relatório profissional em PDF.
            </p>
          </div>
          <Button
            size="lg"
            onClick={exportPdf}
            disabled={exporting || !filtered.length}
            className="shadow-glow"
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "Gerando..." : "Exportar PDF"}
          </Button>
        </header>

        {/* Filtros */}
        <Card className="p-4 md:p-5 bg-card/60 backdrop-blur">
          <div className="flex items-center gap-2 mb-4 text-sm font-medium">
            <Filter className="h-4 w-4 text-primary" /> Filtros
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Período</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Autor</Label>
              <Select value={author} onValueChange={setAuthor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">Todos</SelectItem>
                  {authorOptions.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">Todas</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {period === "custom" && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <Label className="text-xs">De</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          )}
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={BookOpen} label="Livros" value={loading ? "—" : String(stats.total)} />
          <StatCard
            icon={Star}
            label="Média rating"
            value={loading ? "—" : stats.avgRating ? stats.avgRating.toFixed(1) : "—"}
          />
          <StatCard
            icon={Layers}
            label="Páginas"
            value={loading ? "—" : stats.pages.toLocaleString("pt-BR")}
          />
          <StatCard
            icon={Calendar}
            label="Gêneros"
            value={loading ? "—" : String(stats.topGenres.length)}
          />
        </div>

        {/* Top */}
        {!loading && (stats.topGenres.length > 0 || stats.topAuthors.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-medium mb-3">Top gêneros</h3>
              <div className="flex flex-wrap gap-2">
                {stats.topGenres.map(([g, n]) => (
                  <Badge key={g} variant="secondary" className="gap-1">
                    {g} <span className="text-muted-foreground">· {n}</span>
                  </Badge>
                ))}
                {!stats.topGenres.length && <p className="text-sm text-muted-foreground">Sem dados</p>}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-medium mb-3">Top autores</h3>
              <div className="flex flex-wrap gap-2">
                {stats.topAuthors.map(([a, n]) => (
                  <Badge key={a} variant="secondary" className="gap-1">
                    {a} <span className="text-muted-foreground">· {n}</span>
                  </Badge>
                ))}
                {!stats.topAuthors.length && <p className="text-sm text-muted-foreground">Sem dados</p>}
              </div>
            </Card>
          </div>
        )}

        {/* Preview lista */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-medium">Pré-visualização ({filtered.length})</h3>
            <span className="text-xs text-muted-foreground">{periodLabel}</span>
          </div>
          {loading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Nenhum livro corresponde aos filtros.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Título</th>
                    <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Autor</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-center px-4 py-2 font-medium hidden sm:table-cell">Rating</th>
                    <th className="text-right px-4 py-2 font-medium hidden md:table-cell">Páginas</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 50).map((r) => (
                    <tr key={r.id} className="border-t border-border/60 hover:bg-accent/20">
                      <td className="px-4 py-2.5 font-medium">{r.book?.title}</td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                        {r.book?.authors?.join(", ")}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-[11px]">
                          {STATUS_OPTIONS.find((s) => s.value === r.status)?.label || r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                        {r.rating ? `${r.rating}/5` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right hidden md:table-cell">
                        {r.book?.page_count || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 50 && (
                <p className="px-4 py-3 text-xs text-muted-foreground border-t border-border/60">
                  Mostrando 50 de {filtered.length} no preview. O PDF inclui todos.
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Painel de afiliados Amazon — visível somente para admins */}
        {isAdmin && <AffiliateClicksPanel />}
      </div>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4 bg-gradient-to-br from-card to-card/40">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="font-display text-2xl md:text-3xl font-bold mt-1">{value}</div>
    </Card>
  );
}
