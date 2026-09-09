import { useAuthContext } from "@/providers/AuthProvider";

/**
 * Public auth hook kept stable for existing callers.
 * Session state is owned by the single AuthProvider mounted at app root.
 */
export function useAuth() {
  return useAuthContext();
}
