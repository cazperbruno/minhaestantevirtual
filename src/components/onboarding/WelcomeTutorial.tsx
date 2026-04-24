import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ScanLine,
  Sparkles,
  Trophy,
  Users,
  Heart,
  ArrowRight,
  X,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind classes para o gradiente de fundo da cena. Sempre via tokens. */
  gradient: string;
  /** Cor do glow principal (token semântico). */
  glow: string;
  decoration?: React.ReactNode;
};

const SLIDES: Slide[] = [
  {
    id: "welcome",
    eyebrow: "Bem-vindo",
    title: "Sua biblioteca,\nviva.",
    body: "Tudo o que você lê — e o que sonha em ler — em um só lugar. Bonito, rápido, seu.",
    icon: BookOpen,
    gradient: "from-primary/30 via-background to-background",
    glow: "bg-primary/40",
  },
  {
    id: "add",
    eyebrow: "Adicionar é mágico",
    title: "Aponte.\nEscaneie.\nPronto.",
    body: "Use o scanner de código de barras, busque por título ou ISBN. Em segundos seu livro está na estante.",
    icon: ScanLine,
    gradient: "from-status-reading/25 via-background to-background",
    glow: "bg-status-reading/40",
  },
  {
    id: "track",
    eyebrow: "Acompanhe sua jornada",
    title: "Cada página\nimporta.",
    body: "Marque o que está lendo, registre seu progresso e deixe a gente cuidar das estatísticas.",
    icon: Sparkles,
    gradient: "from-accent/30 via-background to-background",
    glow: "bg-accent/40",
  },
  {
    id: "social",
    eyebrow: "Você não lê sozinho",
    title: "Conecte-se\ncom leitores.",
    body: "Siga amigos, entre em clubes, troque livros. A leitura é melhor compartilhada.",
    icon: Users,
    gradient: "from-status-wishlist/25 via-background to-background",
    glow: "bg-status-wishlist/40",
  },
  {
    id: "achievements",
    eyebrow: "Conquiste",
    title: "Suba de nível\na cada livro.",
    body: "XP, conquistas, ligas semanais e desafios sazonais. Sua leitura vira jogo.",
    icon: Trophy,
    gradient: "from-status-read/25 via-background to-background",
    glow: "bg-status-read/40",
  },
  {
    id: "scanner",
    eyebrow: "Tudo pronto",
    title: "Aponte o scanner\ne comece já.",
    body: "Aperte o botão central de scanner, aponte pro código de barras do seu livro e veja a mágica acontecer.",
    icon: ScanLine,
    gradient: "from-primary/40 via-accent/20 to-background",
    glow: "bg-primary/50",
  },
];

interface Props {
  open: boolean;
  /** Slide inicial (0-based). Útil para retomar de onde parou. */
  startAt?: number;
  onClose: () => void;
  onFinish: () => void;
  /** Salva o slide atual cada vez que o usuário avança/retorna. */
  onStep?: (step: number) => void;
  /** Pular: salva o ponto atual e fecha. */
  onSkip?: (currentStep: number) => void;
}

export function WelcomeTutorial({ open, startAt = 0, onClose, onFinish, onStep, onSkip }: Props) {
  const [index, setIndex] = useState(() => Math.max(0, Math.min(startAt, SLIDES.length - 1)));
  const startX = useRef<number | null>(null);
  const isLast = index === SLIDES.length - 1;

  // Quando abrir, posiciona no startAt fornecido (sem resetar para 0).
  useEffect(() => {
    if (open) {
      const safe = Math.max(0, Math.min(startAt, SLIDES.length - 1));
      setIndex(safe);
    }
  }, [open, startAt]);

  // Trava scroll do body
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Persiste o step atual quando muda
  useEffect(() => {
    if (open) onStep?.(index);
  }, [index, open, onStep]);

  // Atalhos de teclado
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") handleSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  const slide = SLIDES[index];
  const Icon = slide.icon;

  function next() {
    haptic("tap");
    if (isLast) {
      onFinish();
      return;
    }
    setIndex((i) => Math.min(SLIDES.length - 1, i + 1));
  }

  function prev() {
    haptic("tap");
    setIndex((i) => Math.max(0, i - 1));
  }

  function handleSkip() {
    haptic("toggle");
    if (onSkip) onSkip(index);
    else onFinish();
  }

  // Swipe nativo (mobile)
  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) next();
      else prev();
    }
    startX.current = null;
  }

  const progress = useMemo(() => ((index + 1) / SLIDES.length) * 100, [index]);
  const resumed = startAt > 0 && index === startAt;

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial de boas-vindas"
      className="fixed inset-0 z-[100] bg-background animate-fade-in"
    >
      {/* Background cinemático */}
      <div className={cn("absolute inset-0 bg-gradient-to-br transition-colors duration-700", slide.gradient)} />
      {/* Glow orbital */}
      <div
        key={slide.id + "-glow-a"}
        className={cn(
          "pointer-events-none absolute -top-32 -right-32 h-[28rem] w-[28rem] rounded-full blur-3xl opacity-70 animate-fade-in",
          slide.glow,
        )}
      />
      <div
        key={slide.id + "-glow-b"}
        className={cn(
          "pointer-events-none absolute -bottom-40 -left-32 h-[26rem] w-[26rem] rounded-full blur-3xl opacity-50 animate-fade-in",
          slide.glow,
        )}
      />
      {/* Grão sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' /></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* Top bar: progresso + skip */}
      <div className="absolute top-0 left-0 right-0 px-5 pt-5 md:px-10 md:pt-7 flex items-center gap-3 z-10">
        <div className="flex-1 flex gap-1.5">
          {SLIDES.map((s, i) => (
            <div
              key={s.id}
              className="h-[3px] flex-1 rounded-full overflow-hidden bg-foreground/10"
            >
              <div
                className="h-full bg-foreground/90 transition-[width] duration-500 ease-out"
                style={{ width: i < index ? "100%" : i === index ? "100%" : "0%" }}
              />
            </div>
          ))}
        </div>
        <button
          onClick={handleSkip}
          className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md"
          aria-label="Pular tutorial"
          title="Pular — vamos lembrar onde você parou"
        >
          Pular
        </button>
        <button
          onClick={handleSkip}
          aria-label="Fechar"
          className="md:hidden text-muted-foreground hover:text-foreground"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Conteúdo */}
      <div
        className="relative z-[1] h-full w-full flex flex-col px-6 md:px-16 pt-24 pb-24 max-w-5xl mx-auto"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Eyebrow + ícone */}
        <div key={slide.id + "-eyebrow"} className="flex items-center gap-3 animate-fade-in">
          <div
            className={cn(
              "h-12 w-12 md:h-14 md:w-14 rounded-2xl flex items-center justify-center border border-foreground/10 backdrop-blur",
              "bg-foreground/5",
            )}
          >
            <Icon className="h-6 w-6 md:h-7 md:w-7 text-foreground" />
          </div>
          <span className="text-xs md:text-sm uppercase tracking-[0.25em] text-muted-foreground">
            {slide.eyebrow}
          </span>
          {resumed && (
            <span className="ml-2 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 animate-fade-in">
              Continuando de onde parou
            </span>
          )}
        </div>

        {/* Título gigante */}
        <h2
          key={slide.id + "-title"}
          className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[1.02] mt-8 md:mt-10 tracking-tight whitespace-pre-line animate-fade-in"
          style={{ animationDuration: "500ms" }}
        >
          {slide.title}
        </h2>

        {/* Corpo */}
        <p
          key={slide.id + "-body"}
          className="mt-6 md:mt-8 text-base md:text-xl text-muted-foreground max-w-xl leading-relaxed animate-fade-in"
          style={{ animationDuration: "600ms" }}
        >
          {slide.body}
        </p>

        {/* Espaço flexível */}
        <div className="flex-1" />

        {/* Ações */}
        <div className="mt-8 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Dots */}
          <div className="flex items-center gap-2 self-center sm:self-auto">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => {
                  haptic("tap");
                  setIndex(i);
                }}
                aria-label={`Ir para tela ${i + 1}`}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === index
                    ? "w-8 bg-foreground"
                    : "w-2 bg-foreground/30 hover:bg-foreground/50",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 justify-end">
            {index > 0 && (
              <Button variant="ghost" size="lg" onClick={prev} className="gap-1">
                Voltar
              </Button>
            )}
            {isLast ? (
              <Link to="/scanner" onClick={onFinish}>
                <Button variant="hero" size="lg" className="gap-2 shadow-lg">
                  Abrir o scanner agora
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <Button
                variant="hero"
                size="lg"
                onClick={next}
                className="gap-2 shadow-lg min-w-[140px]"
              >
                Continuar
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Hint mobile */}
        <p className="mt-4 text-center text-[10px] uppercase tracking-widest text-muted-foreground/60 sm:hidden">
          Deslize para navegar
        </p>
      </div>

      {/* Indicador de progresso fino na borda inferior (decorativo) */}
      <div className="absolute bottom-0 left-0 h-[2px] bg-foreground/80 transition-all duration-500" style={{ width: `${progress}%` }} />
    </div>,
    document.body,
  );
}
