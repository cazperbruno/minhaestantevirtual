import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getMyProfile } from "@/lib/profile-api";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [onboardedKnown, setOnboardedKnown] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setOnboardedKnown(null); return; }
    let cancelled = false;
    const check = async () => {
      try {
        const data = await getMyProfile<{ onboarded_at?: string | null }>();
        if (!cancelled) setOnboardedKnown(!!data?.onboarded_at);
      } catch (error) {
        console.error("[ProtectedRoute] profile check failed", error);
        if (!cancelled) setOnboardedKnown(false);
      }
    };
    check();
    // Re-check when onboarding completes (custom event dispatched by Onboarding.tsx)
    const handler = () => check();
    window.addEventListener("onboarding:completed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("onboarding:completed", handler);
    };
  }, [user]);

  if (loading || (user && onboardedKnown === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  // Force onboarding if not completed (except on /onboarding itself)
  if (onboardedKnown === false && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
