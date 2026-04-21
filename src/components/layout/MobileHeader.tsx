import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  Book,
  Library,
  Infinity as InfinityIcon,
  Users,
  ScanBarcode,
  MessageSquare,
  Trophy,
  Heart,
  ArrowRightLeft,
  Repeat,
  Search,
  User as UserIcon,
  LogOut,
  Settings,
  Sparkles,
  Layers,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/social/NotificationsBell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import readifyMark from "@/assets/readify-mark-v8.webp";

type Item = { to: string; label: string; icon: typeof Book; group: string };

const items: Item[] = [
  { to: "/", label: "Início", icon: Book, group: "Descobrir" },
  { to: "/feed-infinito", label: "Para você", icon: InfinityIcon, group: "Descobrir" },
  { to: "/leitores", label: "Leitores", icon: Users, group: "Descobrir" },

  { to: "/biblioteca", label: "Biblioteca", icon: Library, group: "Meus livros" },
  { to: "/series", label: "Minhas séries", icon: Layers, group: "Meus livros" },
  { to: "/desejos", label: "Lista de desejos", icon: Heart, group: "Meus livros" },
  { to: "/emprestimos", label: "Empréstimos", icon: ArrowRightLeft, group: "Meus livros" },
  { to: "/trocas", label: "Trocas", icon: Repeat, group: "Meus livros" },
  { to: "/scanner", label: "Scanner", icon: ScanBarcode, group: "Meus livros" },
  { to: "/buscar", label: "Buscar livros", icon: Search, group: "Meus livros" },

  { to: "/feed", label: "Feed social", icon: MessageSquare, group: "Comunidade" },
  { to: "/clubes", label: "Clubes de leitura", icon: Users, group: "Comunidade" },
  { to: "/ranking", label: "Ranking", icon: Trophy, group: "Comunidade" },

  { to: "/progresso", label: "Progresso", icon: Sparkles, group: "Você" },
  { to: "/perfil", label: "Perfil", icon: UserIcon, group: "Você" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, group: "Você" },
];

const groups = ["Descobrir", "Meus livros", "Comunidade", "Você"] as const;

export function MobileHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const visibleItems = items;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Até logo!");
    navigate("/auth");
  };

  return (
    <header
      className="md:hidden sticky top-0 z-40 glass border-b border-border"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center justify-between gap-2 px-4 h-14 min-w-0">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Abrir menu"
              className="h-10 w-10 shrink-0 -ml-2 inline-flex items-center justify-center rounded-lg hover:bg-accent/30 tap-scale"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[85vw] max-w-[340px] flex flex-col">
            <SheetHeader className="px-5 pt-6 pb-4 border-b border-border text-left">
              <SheetTitle className="sr-only">Readify</SheetTitle>
               <img src={readifyMark} alt="Readify" className="h-9 max-w-[200px] w-auto select-none object-contain" draggable={false} />
              <p className="text-xs text-muted-foreground mt-1">Sua biblioteca pessoal</p>
            </SheetHeader>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
              {groups.map((g) => (
                <div key={g}>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 px-2">
                    {g}
                  </p>
                  <ul className="space-y-0.5">
                    {visibleItems.filter((i) => i.group === g).map(({ to, label, icon: Icon }) => {
                      const active = pathname === to || (to !== "/" && pathname.startsWith(to));
                      return (
                        <li key={to}>
                          <NavLink
                            to={to}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                              active
                                ? "bg-primary/15 text-primary shadow-glow"
                                : "text-foreground/85 hover:bg-accent/30 hover:text-foreground",
                            )}
                          >
                            <Icon className="h-[18px] w-[18px] shrink-0" />
                            <span className="truncate">{label}</span>
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="border-t border-border p-3 space-y-1">
              <NavLink
                to="/configuracoes"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-accent/30 hover:text-foreground"
              >
                <Settings className="h-4 w-4" /> Configurações
              </NavLink>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
                onClick={() => { setOpen(false); handleLogout(); }}
              >
                <LogOut className="h-4 w-4" /> Sair da conta
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <NavLink to="/" className="flex min-w-0 flex-1 items-center justify-center px-2" aria-label="Readify">
          <img src={readifyMark} alt="Readify" className="h-8 max-w-[140px] xs:max-w-[170px] w-auto select-none object-contain" draggable={false} />
        </NavLink>

        <div className="shrink-0">
          <NotificationsBell compact />
        </div>
      </div>
    </header>
  );
}
