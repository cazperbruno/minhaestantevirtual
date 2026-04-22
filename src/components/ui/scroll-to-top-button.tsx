import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

interface Props {
  /** Quantidade de pixels rolados antes do botão aparecer. */
  threshold?: number;
  /** Classe extra para posicionamento custom (ex.: subir do BottomNav). */
  className?: string;
}

/**
 * Botão flutuante "Voltar ao topo".
 * Aparece após rolar `threshold` px e leva o usuário ao início da página.
 * Posicionado acima do BottomNav no mobile.
 */
export function ScrollToTopButton({ threshold = 480, className }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  const handleClick = () => {
    haptic("tap");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <Button
      type="button"
      variant="hero"
      size="icon"
      onClick={handleClick}
      aria-label="Voltar ao topo"
      title="Voltar ao topo"
      className={cn(
        "fixed right-4 z-40 h-12 w-12 rounded-full shadow-elevated backdrop-blur-md",
        // Acima do BottomNav no mobile, canto inferior no desktop
        "bottom-24 md:bottom-6",
        "transition-all duration-300",
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-3 pointer-events-none",
        className,
      )}
    >
      <ArrowUp className="w-5 h-5" />
    </Button>
  );
}
