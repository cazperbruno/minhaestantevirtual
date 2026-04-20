import { useState } from "react";
import {
  Book,
  Library,
  Infinity as InfinityIcon,
  Users,
  Menu,
  ArrowRightLeft,
  Repeat,
  MessageSquare,
  Trophy,
  Target,
  BarChart3,
  Heart,
  ScanBarcode,
  Search,
  User as UserIcon,
  LogOut,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const primary = [
  { to: "/", label: "Descobrir", icon: Book },
  { to: "/feed-infinito", label: "Para você", icon: InfinityIcon },
  { to: "/biblioteca", label: "Biblioteca", icon: Library },
  { to: "/leitores", label: "Leitores", icon: Users },
];

const more = [
  { to: "/perfil", label: "Perfil", icon: UserIcon, group: "Você" },
  { to: "/desejos", label: "Lista de desejos", icon: Heart, group: "Você" },
  { to: "/metas", label: "Metas", icon: Target, group: "Você" },
  { to: "/estatisticas", label: "Estatísticas", icon: BarChart3, group: "Você" },

  { to: "/feed", label: "Feed social", icon: MessageSquare, group: "Comunidade" },
  { to: "/clubes", label: "Clubes de leitura", icon: Users, group: "Comunidade" },
  { to: "/ranking", label: "Ranking", icon: Trophy, group: "Comunidade" },

  { to: "/emprestimos", label: "Empréstimos", icon: ArrowRightLeft, group: "Livros" },
  { to: "/trocas", label: "Trocas", icon: Repeat, group: "Livros" },
  { to: "/scanner", label: "Scanner", icon: ScanBarcode, group: "Livros" },
  { to: "/buscar", label: "Buscar livros", icon: Search, group: "Livros" },
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

  const groups = ["Você", "Comunidade", "Livros"] as const;

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {primary.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || (to !== "/" && pathname.startsWith(to));
          return (
            <li key={to}>
              <NavLink
                to={to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 text-xs transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]")} />
                <span className="font-medium">{label}</span>
              </NavLink>
            </li>
          );
        })}
        <li>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "w-full flex flex-col items-center justify-center gap-1 py-3 text-xs transition-colors",
                  open ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                aria-label="Mais opções"
              >
                <Menu className={cn("h-5 w-5", open && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]")} />
                <span className="font-medium">Mais</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl border-t border-border max-h-[85vh] overflow-y-auto">
              <SheetHeader className="text-left mb-4">
                <SheetTitle className="font-display text-2xl">
                  <span className="text-gradient-gold">Tudo</span> em um lugar
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-6 pb-4">
                {groups.map((g) => (
                  <div key={g}>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">{g}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {more.filter((m) => m.group === g).map(({ to, label, icon: Icon }) => {
                        const active = pathname === to || pathname.startsWith(to);
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
        </li>
      </ul>
    </nav>
  );
}
