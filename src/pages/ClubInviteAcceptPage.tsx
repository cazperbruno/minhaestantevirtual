import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRedeemInviteToken } from "@/hooks/useClubInviteLink";
import { Button } from "@/components/ui/button";
import { Loader2, Users, ArrowRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

/** /clubes/convite/:token — aceita um convite de clube via link */
export default function ClubInviteAcceptPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const redeem = useRedeemInviteToken();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // guarda token para retomar depois do login
      try {
        sessionStorage.setItem("pending_club_invite", token || "");
      } catch {/* ignore */}
      navigate("/auth", { replace: true });
      return;
    }
    if (!token) {
      setError("Convite inválido");
      return;
    }
    redeem.mutate(token, {
      onSuccess: (clubId) => {
        toast.success("Você entrou no clube!");
        navigate(`/clubes/${clubId}`, { replace: true });
      },
      onError: (e: any) => {
        const map: Record<string, string> = {
          invalid_or_revoked: "Este convite não é mais válido.",
          expired: "Este convite expirou.",
          max_uses_reached: "Este convite atingiu o limite de usos.",
        };
        setError(map[e?.message] || e?.message || "Não foi possível usar o convite.");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, loading]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="glass rounded-2xl p-8 max-w-sm w-full text-center">
        {error ? (
          <>
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-3" />
            <h1 className="font-display text-xl font-bold mb-2">Convite indisponível</h1>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button asChild variant="hero">
              <Link to="/clubes">
                Ver clubes <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </>
        ) : (
          <>
            <Users className="w-10 h-10 text-primary mx-auto mb-3" />
            <h1 className="font-display text-xl font-bold mb-2">Entrando no clube…</h1>
            <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
          </>
        )}
      </div>
    </div>
  );
}
