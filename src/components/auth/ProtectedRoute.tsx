import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { getMyProfile } from "@/lib/profile-api";
import { Loader2 } from "lucide-react";

/**
 * Single protected-route boundary for the authenticated application.
 * It owns the onboarding gate and the one Realtime runtime for the session.
 */
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const location = useLocation();
  const [onboardedKnown, setOnboardedKnown] = useState<boolean | null>(null);

  useRealtimeInvalidation();

  useEffect(() => {
    if (!userId) {
      setOnboardedKnown(null);
      return;
    }

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

    void check();
    const handler = () => { void check(); };
    window.addEventListener("onboarding:completed", handler);

    return () => {
      cancelled = true;
      window.removeEventListener("onboarding:completed", handler);
    };
  }, [userId]);

  if (loading || (user && onboardedKnown === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;

  if (onboardedKnown === false && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
