import { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

interface MetricCardProps {
  icon?: ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  /** Variação percentual (positiva ou negativa) — desenha seta colorida. */
  delta?: number | null;
  /** Sufixo opcional (ex.: "%", "ms") */
  suffix?: string;
  loading?: boolean;
  tone?: "default" | "primary" | "success" | "warn" | "danger";
}

const TONE_CLASSES: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  default: "border-border/50 bg-muted/20",
  primary: "border-primary/40 bg-primary/5",
  success: "border-success/40 bg-success/5",
  warn: "border-warning/40 bg-warning/5",
  danger: "border-destructive/40 bg-destructive/5",
};

/**
 * Card de KPI do dashboard admin — visual Apple-clean: tipografia grande,
 * delta com seta colorida, e ícone discreto no topo.
 */
export function MetricCard({
  icon, label, value, hint, delta, suffix, loading, tone = "default",
}: MetricCardProps) {
  const display = typeof value === "number" ? value.toLocaleString("pt-BR") : value;
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const deltaTone = !hasDelta ? "" : delta! > 0.5
    ? "text-success" : delta! < -0.5 ? "text-destructive" : "text-muted-foreground";
  const DeltaIcon = !hasDelta ? Minus : delta! > 0.5 ? ArrowUpRight : delta! < -0.5 ? ArrowDownRight : Minus;
  return (
    <div className={cn("rounded-xl border p-4 transition-all hover:shadow-sm", TONE_CLASSES[tone])}>
      <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5">
          {icon}
          <span className="uppercase tracking-wide font-medium">{label}</span>
        </span>
        {hasDelta && (
          <span className={cn("flex items-center gap-0.5 font-mono text-[11px]", deltaTone)}>
            <DeltaIcon className="w-3 h-3" />
            {Math.abs(delta!).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <>
            <span className="font-display text-3xl font-bold leading-none tabular-nums">{display}</span>
            {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
          </>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}
