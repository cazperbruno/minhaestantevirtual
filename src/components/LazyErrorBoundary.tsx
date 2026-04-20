import { Component, ReactNode } from "react";

interface Props { children: ReactNode }
interface State { hasError: boolean }

/**
 * Captura erros de "Failed to fetch dynamically imported module" que ocorrem
 * quando o Vite/CDN reinicia e o cliente tenta carregar um chunk que não existe
 * mais. Solução: recarregar a página automaticamente uma única vez.
 */
export class LazyErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    const msg = String(error?.message || "");
    const isChunkError =
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Importing a module script failed") ||
      msg.includes("error loading dynamically imported module");

    if (isChunkError && typeof window !== "undefined") {
      // Evita loop infinito: só recarrega 1x por sessão
      const key = "lazy-reload-attempted";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
    }
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
          <div className="max-w-sm">
            <p className="text-lg font-semibold mb-2">Não foi possível carregar a página</p>
            <p className="text-sm text-muted-foreground mb-4">
              Tente recarregar a página.
            </p>
            <button
              onClick={() => { sessionStorage.removeItem("lazy-reload-attempted"); window.location.reload(); }}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
