import { Flame, Snowflake, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useStreakRisk } from "@/hooks/useStreakRisk";
import { useStreakFreeze } from "@/hooks/useStreak";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const DISMISS_KEY = "streak-risk-dismissed-date";

/**
 * Banner discreto que aparece quando o streak do usuário pode quebrar hoje.
 * Permite dismiss por dia (não polui se a pessoa já viu).
 */
export function StreakAtRiskBanner() {
  const { user } = useAuth();
  const { data: risk } = useStreakRisk(user?.id);
  const freeze = useStreakFreeze(user?.id);
  const [dismissed, setDismissed] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem(DISMISS_KEY) === today);
  }, [today]);

  if (!risk?.at_risk || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, today);
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className="relative mb-4 rounded-2xl border border-orange-500/30 bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-transparent p-4 shadow-sm"
    >
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dispensar aviso"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="shrink-0 w-10 h-10 rounded-full bg-orange-500/20 grid place-items-center">
          <Flame className="w-5 h-5 text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">
            🔥 Sua sequência de {risk.current_days} dia
            {risk.current_days > 1 ? "s" : ""} está em risco
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Leia 1 página hoje pra manter o streak vivo
            {risk.freezes_available > 0 && " — ou use um freeze"}.
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <Button asChild size="sm" className="h-8 gap-1.5">
              <Link to="/library?status=reading">
                <Flame className="w-3.5 h-3.5" /> Ler agora
              </Link>
            </Button>
            {risk.freezes_available > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                disabled={freeze.isPending}
                onClick={() => freeze.mutate()}
              >
                <Snowflake className="w-3.5 h-3.5" />
                Usar freeze ({risk.freezes_available})
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
