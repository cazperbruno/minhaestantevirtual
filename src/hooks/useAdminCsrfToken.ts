import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface CsrfState {
  token: string | null;
  expiresAt: number | null;
}

const STORAGE_KEY = "readify.admin.csrf";
const REFRESH_BEFORE_MS = 5 * 60 * 1000; // renova 5 min antes do vencimento

function readStorage(): CsrfState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, expiresAt: null };
    const j = JSON.parse(raw);
    return {
      token: typeof j.token === "string" ? j.token : null,
      expiresAt: typeof j.expiresAt === "number" ? j.expiresAt : null,
    };
  } catch {
    return { token: null, expiresAt: null };
  }
}

function writeStorage(s: CsrfState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* sessionStorage may be unavailable */
  }
}

function clearStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* noop */ }
}

/**
 * Hook que mantém um token anti-CSRF ativo para o admin logado.
 * Armazena em sessionStorage (some quando a aba fecha).
 * Renova automaticamente perto do vencimento.
 */
export function useAdminCsrfToken() {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [state, setState] = useState<CsrfState>(() => readStorage());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<string | null> | null>(null);

  const issue = useCallback(async (rotate = false): Promise<string | null> => {
    if (inflight.current) return inflight.current;
    setLoading(true);
    setError(null);
    const p = (async () => {
      try {
        const { data, error: invErr } = await supabase.functions.invoke(
          "admin-csrf-token",
          { body: { rotate } },
        );
        if (invErr) throw invErr;
        const token = (data as any)?.token as string | undefined;
        const expiresAt = (data as any)?.expires_at as string | undefined;
        if (!token || !expiresAt) throw new Error("Resposta inválida");
        const next: CsrfState = {
          token,
          expiresAt: new Date(expiresAt).getTime(),
        };
        setState(next);
        writeStorage(next);
        return token;
      } catch (e: any) {
        setError(e?.message ?? "Falha ao obter token CSRF");
        return null;
      } finally {
        setLoading(false);
        inflight.current = null;
      }
    })();
    inflight.current = p;
    return p;
  }, []);

  // Garante token ao montar / quando virar admin
  useEffect(() => {
    if (adminLoading || !isAdmin) return;
    const cached = readStorage();
    const now = Date.now();
    if (!cached.token || !cached.expiresAt || cached.expiresAt - now < REFRESH_BEFORE_MS) {
      void issue(false);
    } else {
      setState(cached);
    }
  }, [isAdmin, adminLoading, issue]);

  // Limpa token ao deslogar
  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      clearStorage();
      setState({ token: null, expiresAt: null });
    }
  }, [isAdmin, adminLoading]);

  /**
   * Retorna um token válido. Renova automaticamente se expirou.
   */
  const ensureToken = useCallback(async (): Promise<string | null> => {
    const cached = readStorage();
    const now = Date.now();
    if (cached.token && cached.expiresAt && cached.expiresAt - now > REFRESH_BEFORE_MS) {
      return cached.token;
    }
    return await issue(false);
  }, [issue]);

  return {
    token: state.token,
    expiresAt: state.expiresAt,
    loading,
    error,
    ensureToken,
    rotate: () => issue(true),
  };
}
