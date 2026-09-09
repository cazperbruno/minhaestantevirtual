import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LogOut, Menu, Settings, Shield } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/social/NotificationsBell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { accountNavigation, navigationSections } from "@/config/navigation";
import readifyMark from "@/assets/readify-mark-v8.webp";

export function MobileHeader() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { isAdmin } = useIsAdmin();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Não foi possível sair da conta. Tente novamente.");
      return;
    }
    toast.success("Até logo!");
    navigate("/auth");
  };

  return (
    <header
      className="sticky top-0 z-40 border-b border-border glass md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-14 min-w-0 items-center justify-between gap-2 px-4">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Abrir menu"
              className="-ml-3 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg hover:bg-accent/30 tap-scale"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>

          <SheetContent side="left" className="flex w-[88vw] max-w-[340px] flex-col p-0">
            <SheetHeader className="border-b border-border px-5 pb-4 pt-6 text-left">
              <SheetTitle className="sr-only">Menu Readify</SheetTitle>
              <div className="flex items-center gap-3">
                <img
                  src={readifyMark}
                  alt="Readify"
                  className="h-9 w-9 shrink-0 select-none object-contain"
                  draggable={false}
                />
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-bold">Readify</p>
                  <p className="text-xs text-muted-foreground">Sua biblioteca inteligente</p>
                </div>
              </div>
            </SheetHeader>

            <nav aria-label="Menu Readify" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
              {navigationSections.map((section) => (
                <section key={section.label} aria-label={section.label}>
                  <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                    {section.label}
                  </p>
                  <ul className="space-y-0.5">
                    {section.items.map(({ to, label, icon: Icon, end }) => (
                      <li key={to}>
                        <NavLink
                          to={to}
                          end={end}
                          onClick={() => setOpen(false)}
                          className={({ isActive }) =>
                            cn(
                              "flex min-h-12 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                              isActive
                                ? "bg-primary/10 text-primary"
                                : "text-foreground/85 hover:bg-accent/30 hover:text-foreground",
                            )
                          }
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          <span className="truncate">{label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              <section aria-label="Conta">
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                  Conta
                </p>
                <ul className="space-y-0.5">
                  {accountNavigation.map(({ to, label, icon: Icon }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex min-h-12 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-foreground/85 hover:bg-accent/30 hover:text-foreground",
                          )
                        }
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="truncate">{label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </section>
            </nav>

            <div className="shrink-0 space-y-1 border-t border-border p-3">
              <NavLink
                to="/configuracoes"
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/30 hover:text-foreground"
              >
                <Settings className="h-4 w-4" /> Configurações
              </NavLink>

              {isAdmin && (
                <NavLink
                  to="/admin"
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                >
                  <Shield className="h-4 w-4" /> Admin
                </NavLink>
              )}

              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  setOpen(false);
                  void handleLogout();
                }}
              >
                <LogOut className="h-4 w-4" /> Sair
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <NavLink to="/" className="flex min-w-0 flex-1 items-center justify-center px-2" aria-label="Readify — Início">
          <img
            src={readifyMark}
            alt="Readify"
            className="h-8 w-8 select-none object-contain"
            draggable={false}
          />
        </NavLink>

        <div className="shrink-0">
          <NotificationsBell compact />
        </div>
      </div>
    </header>
  );
}
