import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useAdminCsrfToken } from "@/hooks/useAdminCsrfToken";
import { invokeAdmin } from "@/lib/admin-invoke";
import { toast } from "sonner";
import {
  Search, Loader2, ScanBarcode, CheckCircle2, AlertTriangle, Database, Plus,
} from "lucide-react";

interface PreviewResult {
  ok: boolean;
  isbn?: string;
  not_found?: boolean;
  already_in_database?: boolean;
  existing?: {
    id: string;
    title: string;
    authors: string[];
    cover_url: string | null;
    quality_score: number | null;
  };
  data?: {
    title: string;
    subtitle: string | null;
    authors: string[];
    publisher: string | null;
    published_year: number | null;
    description: string | null;
    cover_url: string | null;
    page_count: number | null;
    language: string | null;
    categories: string[] | null;
    isbn_13: string | null;
    isbn_10: string | null;
    source: string | null;
  };
  quality_score?: number;
  sources_tried?: string[];
  source_results?: Record<string, boolean>;
  used_ai?: boolean;
  is_portuguese?: boolean;
  duration_ms?: number;
}

/**
 * Busca ISBN 1-clique com preview ANTES de importar.
 * Mostra capa, dados, fontes que responderam e botão de importar.
 */
export function IsbnQuickLookup({ onImported }: { onImported?: () => void }) {
  const csrf = useAdminCsrfToken();
  const [isbn, setIsbn] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);

  const lookup = async () => {
    const cleaned = isbn.replace(/[^0-9Xx]/g, "");
    if (cleaned.length !== 10 && cleaned.length !== 13) {
      toast.error("ISBN deve ter 10 ou 13 dígitos");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const csrfToken = await csrf.ensureToken();
      if (!csrfToken) {
        toast.error("Token de segurança ausente. Recarregue o painel.");
        return;
      }
      const { data, error } = await invokeAdmin<PreviewResult>("lookup-isbn", {
        csrfToken,
        body: { isbn: cleaned },
      });
      if (error) throw error;
      setResult(data);
      if (data?.not_found) {
        toast.warning("ISBN não encontrado em nenhuma fonte");
      } else if (data?.already_in_database) {
        toast.info("Esse livro já está no banco");
      } else {
        toast.success(`Encontrado em ${data?.data?.source} · qualidade ${data?.quality_score}/100`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na busca");
    } finally {
      setLoading(false);
    }
  };

  const importNow = async () => {
    if (!result?.data) return;
    setImporting(true);
    try {
      const csrfToken = await csrf.ensureToken();
      if (!csrfToken) {
        toast.error("Token de segurança ausente.");
        return;
      }
      const { data, error } = await invokeAdmin<{ inserted: number; already_existed: number }>(
        "import-books-by-isbn",
        { csrfToken, body: { isbns: [result.isbn] } },
      );
      if (error) throw error;
      if ((data?.inserted ?? 0) > 0) {
        toast.success("Livro importado com sucesso!");
        setResult(null);
        setIsbn("");
        onImported?.();
      } else if ((data?.already_existed ?? 0) > 0) {
        toast.info("Livro já estava no banco");
      } else {
        toast.warning("Importação não inseriu o livro");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao importar");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="font-display text-xl font-semibold flex items-center gap-2">
          <ScanBarcode className="w-5 h-5 text-primary" />
          Busca rápida por ISBN · 1 clique
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Pesquisa em BrasilAPI → OpenLibrary → Google Books → IA fallback. Mostra preview antes de importar.
        </p>
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-xs">ISBN (10 ou 13 dígitos)</Label>
          <Input
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder="9788532530802"
            className="font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") void lookup();
            }}
            disabled={loading || importing}
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        <Button onClick={() => void lookup()} disabled={loading || !isbn.trim()} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </Button>
      </div>

      {/* Resultado */}
      {result && (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
          {result.not_found && (
            <div className="flex items-start gap-3 text-sm">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">ISBN não encontrado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Fontes tentadas: {result.sources_tried?.join(", ")} ·{" "}
                  {result.duration_ms}ms
                </p>
                {result.source_results && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(result.source_results).map(([k, v]) => (
                      <Badge key={k} variant={v ? "default" : "outline"} className="text-[10px]">
                        {v ? "✓" : "✗"} {k}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {result.already_in_database && result.existing && (
            <div className="flex gap-3 items-start">
              {result.existing.cover_url && (
                <img
                  src={result.existing.cover_url}
                  alt=""
                  className="w-16 h-24 rounded object-cover border border-border/40 shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <Badge variant="secondary" className="text-[10px] gap-1 mb-1">
                  <Database className="w-3 h-3" /> Já no banco
                </Badge>
                <p className="font-semibold">{result.existing.title}</p>
                <p className="text-xs text-muted-foreground">{result.existing.authors?.join(", ")}</p>
                {result.existing.quality_score != null && (
                  <p className="text-xs mt-1">
                    Qualidade:{" "}
                    <span className={result.existing.quality_score >= 70 ? "text-success" : "text-warning"}>
                      {result.existing.quality_score}/100
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}

          {result.ok && result.data && !result.already_in_database && (
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                {result.data.cover_url ? (
                  <img
                    src={result.data.cover_url}
                    alt=""
                    className="w-20 h-28 rounded object-cover border border-border/40 shrink-0"
                  />
                ) : (
                  <div className="w-20 h-28 rounded bg-muted border border-border/40 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold leading-tight">{result.data.title}</p>
                  {result.data.subtitle && (
                    <p className="text-xs text-muted-foreground italic mt-0.5">{result.data.subtitle}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {result.data.authors.join(", ") || "Sem autor"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {[
                      result.data.publisher,
                      result.data.published_year,
                      result.data.page_count ? `${result.data.page_count}p` : null,
                      result.data.language,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge
                      variant={result.quality_score && result.quality_score >= 70 ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      Qualidade {result.quality_score}/100
                    </Badge>
                    {result.is_portuguese && (
                      <Badge variant="default" className="text-[10px] bg-success/20 text-success border-success/30">
                        🇧🇷 PT-BR
                      </Badge>
                    )}
                    {result.used_ai && (
                      <Badge variant="outline" className="text-[10px]">IA fallback</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">{result.data.source}</Badge>
                    <Badge variant="outline" className="text-[10px]">{result.duration_ms}ms</Badge>
                  </div>
                </div>
              </div>

              {result.data.description && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Sinopse</summary>
                  <p className="mt-1 text-muted-foreground line-clamp-6">{result.data.description}</p>
                </details>
              )}

              {result.source_results && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(result.source_results).map(([k, v]) => (
                    <Badge key={k} variant={v ? "secondary" : "outline"} className="text-[10px]">
                      {v ? <CheckCircle2 className="w-2.5 h-2.5 inline mr-0.5" /> : null}
                      {k}
                    </Badge>
                  ))}
                </div>
              )}

              <Button onClick={() => void importNow()} disabled={importing} className="w-full gap-2">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Importar para o banco
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
