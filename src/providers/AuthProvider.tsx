import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext, type AuthContextValue } from "@/providers/auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let authEventVersion = 0;

    // Exactly one auth subscription for the whole application runtime.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      authEventVersion += 1;
      setSession(nextSession);
      setLoading(false);
    });

    // Resolve the persisted session once on boot. If an auth event arrives
    // first, its newer state wins instead of being overwritten by getSession().
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("[AuthProvider] failed to restore session", error);
        if (authEventVersion === 0) setSession(null);
      } else if (authEventVersion === 0) {
        setSession(data.session);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
