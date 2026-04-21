/**
 * SeriesValidationPanel — painel de diagnóstico de séries.
 *
 * Mostra séries com inconsistências (lacunas, duplicados, sem número)
 * e oferece botão de auto-reparo para os casos resolvíveis.
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Wrench,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  useSeriesValidation,
  useRepairSeries,
  type SeriesIntegrityRow,
} from "@/hooks/useSeriesValidation";
import { useState } from "react";

function severityVariant(s: SeriesIntegrityRow["severity"]) {
  switch (s) {
    case "high":
      return "destructive" as const;
    case "medium":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

function severityLabel(s: SeriesIntegrityRow["severity"]) {
  return s === "high" ? "Crítico" : s === "medium" ? "Atenção" : "Leve";
}

export function SeriesValidationPanel() {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, isFetching, refetch } = useSeriesValidation(enabled);
  const repair = useRepairSeries();

  return (
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">
              Validação de séries
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
              Verifica se cada série tem volumes sequenciais (1..N), sem
              lacunas, duplicatas ou livros sem número.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEnabled(true);
            refetch();
          }}
          disabled={isLoading || isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
            aria-hidden
          />
          {enabled ? "Re-executar" : "Executar validação"}
        </Button>
      </div>

      {!enabled && (
        <p className="text-xs text-muted-foreground">
          Clique em <strong>Executar validação</strong> para verificar todas
          as suas séries.
        </p>
      )}

      {enabled && isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {enabled && !isLoading && (data?.length ?? 0) === 0 && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          <AlertTitle>Tudo certo!</AlertTitle>
          <AlertDescription>
            Nenhuma inconsistência encontrada nas suas séries.
          </AlertDescription>
        </Alert>
      )}

      {enabled && !isLoading && (data?.length ?? 0) > 0 && (
        <ul className="space-y-2">
          {data!.map((row) => {
            const canRepair = row.has_unnumbered;
            return (
              <li
                key={row.series_id}
                className="rounded-md border bg-card p-3 sm:p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/serie/${row.series_id}`}
                        className="font-medium truncate hover:underline"
                      >
                        {row.series_title}
                      </Link>
                      <Badge variant={severityVariant(row.severity)}>
                        {severityLabel(row.severity)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {row.numbered_count}
                        {row.total_volumes ? `/${row.total_volumes}` : ""} vol.
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                      {row.has_unnumbered && (
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle
                            className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0"
                            aria-hidden
                          />
                          <span>
                            <strong>{row.unnumbered_count}</strong>{" "}
                            livro(s) sem número de volume.
                          </span>
                        </div>
                      )}
                      {row.has_duplicates && (
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle
                            className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0"
                            aria-hidden
                          />
                          <span>
                            Volumes duplicados:{" "}
                            <strong>
                              {row.duplicate_volumes.join(", ")}
                            </strong>
                          </span>
                        </div>
                      )}
                      {row.has_gaps && (
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle
                            className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0"
                            aria-hidden
                          />
                          <span>
                            Faltando vol.{" "}
                            <strong>
                              {row.missing_volumes.slice(0, 10).join(", ")}
                              {row.missing_volumes.length > 10
                                ? `…(+${row.missing_volumes.length - 10})`
                                : ""}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    {canRepair && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => repair.mutate(row.series_id)}
                        disabled={repair.isPending}
                      >
                        <Wrench className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                        Auto-reparar
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/serie/${row.series_id}`}>
                        Abrir
                        <ChevronRight className="h-3.5 w-3.5 ml-1" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
