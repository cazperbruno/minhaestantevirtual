import { ScanBarcode } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Botão flutuante do Scanner — acesso 1-tap em qualquer tela mobile.
 * Posicionado acima do BottomNav (que tem ~64px de altura) + safe area iOS.
 * Esconde-se quando já estamos no /scanner para não duplicar ação.
 */
export function ScannerFab() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (pathname.startsWith("/scanner") || pathname.startsWith("/auth") || pathname.startsWith("/onboarding")) {
    return null;
  }
  return (
    <button
      onClick={() => navigate("/scanner")}
      aria-label="Abrir scanner"
      className="md:hidden fixed right-4 z-50 h-14 w-14 rounded-full bg-gradient-gold text-primary-foreground shadow-glow flex items-center justify-center tap-scale active:scale-95 transition-transform border border-primary/30"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 80px)" }}
    >
      <ScanBarcode className="h-6 w-6" />
      <span className="sr-only">Escanear livro</span>
    </button>
  );
}
