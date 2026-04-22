import { useState, type ReactNode } from "react";
import { EyeOff, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Página marcada como spoiler pelo autor da mensagem. */
  spoilerPage: number | null | undefined;
  /** Página atual do leitor (do livro do mês). null = desconhecida. */
  readerPage: number | null;
  /** Conteúdo da mensagem. */
  children: ReactNode;
  /** Classe da bolha externa (cor de fundo etc). */
  className?: string;
  /**
   * Modo "sem spoiler" global ligado pelo usuário — força o blur em TODA mensagem
   * com spoilerPage, independente da página atual do leitor.
   */
  forceHide?: boolean;
}

/**
 * Esconde o conteúdo da mensagem se ela contém spoiler além da página atual do leitor.
 * Permite revelar manualmente com 1 clique.
 *
 * Regras:
 * - Sem spoilerPage → renderiza normalmente.
 * - forceHide ligado → sempre esconde (até revelar manualmente).
 * - Com spoilerPage e readerPage >= spoilerPage → renderiza normalmente.
 * - Caso contrário → blur + aviso até o usuário revelar.
 */
export function SpoilerWrapper({ spoilerPage, readerPage, children, className, forceHide }: Props) {
  const [revealed, setRevealed] = useState(false);

  // Quando o modo sem-spoiler é desligado, voltar a mostrar normalmente sem cliques.
  // Quando é ligado, ocultar de novo (a menos que já tenha sido revelado nesta sessão).
  // Não mexemos em `revealed` aqui para preservar a escolha do usuário por mensagem.

  const hasSpoiler = typeof spoilerPage === "number" && spoilerPage > 0;
  const shouldHide =
    hasSpoiler &&
    !revealed &&
    (forceHide || readerPage == null || readerPage < (spoilerPage ?? 0));

  if (!hasSpoiler) {
    return <div className={className}>{children}</div>;
  }

  if (shouldHide) {
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className={cn(
          "relative w-full text-left rounded-2xl px-3 py-2 text-sm overflow-hidden",
          "bg-muted/60 border border-dashed border-primary/40 hover:border-primary/70 transition-colors",
          className,
        )}
        aria-label={`Revelar spoiler da página ${spoilerPage}`}
      >
        <div className="absolute inset-0 backdrop-blur-md bg-background/40 flex items-center justify-center gap-2 pointer-events-none">
          <EyeOff className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground/90">
            Spoiler · pág. {spoilerPage} · toque para revelar
          </span>
        </div>
        <div className="opacity-0 select-none" aria-hidden>
          {children}
        </div>
      </button>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {hasSpoiler && (
        <div className="flex items-center gap-1 text-[10px] text-primary mb-1 font-semibold uppercase tracking-wider">
          <Eye className="w-2.5 h-2.5" /> spoiler · pág. {spoilerPage}
        </div>
      )}
      {children}
    </div>
  );
}
