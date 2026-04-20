import { useState } from "react";
import {
  Library,
  Infinity as InfinityIcon,
  Trophy,
  User as UserIcon,
  ScanLine,
  Menu,
  Heart,
  Target,
  BarChart3,
  MessageSquare,
  Users,
  ArrowRightLeft,
  Repeat,
  Search,
  Book,
  LogOut,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { prefetch } from "@/lib/prefetch";

// Order requested: Biblioteca · Feed · Escanear (centro vermelho) · Ranking · Perfil.
const left = [
  { to: "/biblioteca", label: "Biblioteca", icon: Library },
  { to: "/feed-infinito", label: "Feed", icon: InfinityIcon },
];
const right = [
  { to: "/ranking", label: "Ranking", icon: Trophy },
  { to: "/perfil", label: "Perfil", icon: UserIcon },
];

const more = [
  { to: "/", label: "Descobrir", icon: Book, group: "Descobrir" },
  { to: "/buscar", label: "Buscar", icon: Search, group: "Descobrir" },
  { to: "/leitores", label: "Leitores", icon: Users, group: "Descobrir" },

  { to: "/desejos", label: "Lista de desejos", icon: Heart, group: "Você" },
  { to: "/metas", label: "Metas", icon: Target, group: "Você" },
  { to: "/estatisticas", label: "Estatísticas", icon: BarChart3, group: "Você" },

  { to: "/feed", label: "Feed social", icon: MessageSquare, group: "Comunidade" },
  { to: "/clubes", label: "Clubes de leitura", icon: Users, group: "Comunidade" },

  { to: "/emprestimos", label: "Empréstimos", icon: ArrowRightLeft, group: "Livros" },
  { to: "/trocas", label: "Trocas", icon: Repeat, group: "Livros" },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Até logo!");
    navigate("/auth");
  };

  const groups = ["Descobrir", "Você", "Comunidade", "Livros"] as const;
  const scanActive = pathname.startsWith("/scanner");

  const isActive = (to: string) =>
    pathname === to || (to !== "/" && pathname.startsWith(to));

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5 items-end relative">
        {left.map(({ to, label, icon: Icon }) => {
          const active = isActive(to);
          return (
            <li key={to}>
              <NavLink
                to={to}
                onMouseEnter={() => prefetchFor(to)}
                onTouchStart={() => prefetchFor(to)}
                onFocus={() => prefetchFor(to)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 text-[11px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]")} />
                <span className="font-medium">{label}</span>
              </NavLink>
            </li>
          );
        })}

        {/* Center: Escanear — destaque vermelho (the hero action) */}
        <li className="flex justify-center">
          <button
            onClick={() => navigate("/scanner")}
            aria-label="Escanear livro"
            className={cn(
              "relative -mt-7 h-16 w-16 rounded-full flex flex-col items-center justify-center",
              "bg-primary text-primary-foreground border-4 border-background shadow-glow",
              "transition-transform active:scale-95 tap-scale",
              scanActive && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
            )}
          >
            <ScanLine className="h-6 w-6" />
            <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">Escanear</span>
          </button>
        </li>

        {right.map(({ to, label, icon: Icon }) => {
          const active = isActive(to);
          return (
            <li key={to}>
              <NavLink
                to={to}
                onMouseEnter={() => prefetchFor(to)}
                onTouchStart={() => prefetchFor(to)}
                onFocus={() => prefetchFor(to)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 text-[11px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]")} />
                <span className="font-medium">{label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>

      {/* Discreet "Mais" — top-right tab above the nav */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            className="absolute -top-9 right-3 h-8 px-3 rounded-full bg-card/90 backdrop-blur border border-border text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium shadow-card"
            aria-label="Mais opções"
          >
            <Menu className="h-3.5 w-3.5" /> Mais
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl border-t border-border max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left mb-4">
            <SheetTitle className="font-display text-2xl">
              <span className="text-primary">Tudo</span> em um lugar
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6 pb-4">
            {groups.map((g) => (
              <div key={g}>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">{g}</p>
                <div className="grid grid-cols-3 gap-2">
                  {more.filter((m) => m.group === g).map(({ to, label, icon: Icon }) => {
                    const active = isActive(to);
                    return (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all tap-scale text-center min-h-[88px]",
                          active
                            ? "bg-primary/15 border-primary/40 text-primary shadow-glow"
                            : "border-border bg-card/40 text-foreground hover:border-primary/30 hover:bg-primary/5",
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="text-xs font-medium leading-tight">{label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground"
              onClick={() => { setOpen(false); handleLogout(); }}
            >
              <LogOut className="h-4 w-4" /> Sair da conta
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
