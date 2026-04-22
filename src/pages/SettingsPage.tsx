import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { LogOut, Settings as SettingsIcon, Shield, Eye, BookOpen, Bell, Download, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { InstallAppCard } from "@/components/pwa/InstallAppCard";
import { PushNotificationsCard } from "@/components/pwa/PushNotificationsCard";
import { VersionTag } from "@/components/pwa/VersionTag";
import { openTutorial } from "@/hooks/useTutorial";

type Visibility = "public" | "private" | "followers";

export default function SettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [showProgress, setShowProgress] = useState<boolean>(true);
  const [savingFlag, setSavingFlag] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      setProfile(data);
      // show_progress is local UI preference (also saved to localStorage)
      const stored = localStorage.getItem("show_progress");
      setShowProgress(stored === null ? true : stored === "true");
    })();
  }, [user]);

  const updateProfile = async (patch: Record<string, any>, label: string) => {
    if (!user) return;
    setSavingFlag(label);
    const { error } = await supabase.from("profiles").update(patch as any).eq("id", user.id);
    if (error) {
      toast.error("Não foi possível salvar");
    } else {
      setProfile({ ...profile, ...patch });
      toast.success("Configuração salva");
    }
    setSavingFlag(null);
  };

  const setProfileVisibility = (val: Visibility) =>
    updateProfile({ profile_visibility: val }, "profile_visibility");

  const setLibraryVisibility = (val: Visibility) =>
    updateProfile({ library_visibility: val }, "library_visibility");

  const toggleProgress = (val: boolean) => {
    setShowProgress(val);
    localStorage.setItem("show_progress", String(val));
    toast.success("Configuração salva");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  if (!profile) {
    return (
      <AppShell>
        <div className="px-5 md:px-10 pt-8 pb-16 max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  const profileIsPublic = (profile.profile_visibility || "public") === "public";
  const libraryIsPublic = (profile.library_visibility || "public") === "public";

  return (
    <AppShell>
      <div className="px-4 sm:px-6 md:px-10 pt-6 sm:pt-8 pb-16 max-w-2xl mx-auto min-w-0 animate-fade-in">
        <header className="mb-6 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight">Configurações</h1>
            <p className="text-sm text-muted-foreground">Privacidade, preferências e instalação</p>
          </div>
        </header>

        {/* Privacidade */}
        <section className="glass rounded-2xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Privacidade</h2>
          </div>

          {/* Perfil público / privado (toggle simples) */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-sm font-medium">Perfil público</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativo, qualquer pessoa pode ver seu perfil.
              </p>
            </div>
            <Switch
              checked={profileIsPublic}
              disabled={savingFlag === "profile_visibility"}
              onCheckedChange={(v) => setProfileVisibility(v ? "public" : "private")}
            />
          </div>

          {/* Visibilidade detalhada do perfil */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Quem pode ver meu perfil</Label>
            <Select
              value={profile.profile_visibility || "public"}
              onValueChange={(v) => setProfileVisibility(v as Visibility)}
              disabled={savingFlag === "profile_visibility"}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Todos</SelectItem>
                <SelectItem value="followers">Apenas seguidores</SelectItem>
                <SelectItem value="private">Somente eu</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Biblioteca pública / privada */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" /> Biblioteca pública
              </Label>
              <p className="text-xs text-muted-foreground">
                Permitir que outros vejam seus livros.
              </p>
            </div>
            <Switch
              checked={libraryIsPublic}
              disabled={savingFlag === "library_visibility"}
              onCheckedChange={(v) => setLibraryVisibility(v ? "public" : "private")}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Quem pode ver minha biblioteca</Label>
            <Select
              value={profile.library_visibility || "public"}
              onValueChange={(v) => setLibraryVisibility(v as Visibility)}
              disabled={savingFlag === "library_visibility"}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Todos</SelectItem>
                <SelectItem value="followers">Apenas seguidores</SelectItem>
                <SelectItem value="private">Somente eu</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Exibir progresso */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Exibir progresso de leitura
              </Label>
              <p className="text-xs text-muted-foreground">
                Mostrar barra de progresso e páginas lidas no seu perfil.
              </p>
            </div>
            <Switch checked={showProgress} onCheckedChange={toggleProgress} />
          </div>
        </section>

        {/* Notificações */}
        <section className="mt-5 glass rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Notificações</h2>
          </div>
          <PushNotificationsCard />
        </section>

        {/* Instalação do App */}
        <section className="mt-5 space-y-3">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Instalar aplicativo</h2>
          </div>
          <InstallAppCard />
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/instalar">Ver instruções completas</Link>
          </Button>
        </section>

        {/* Tutorial */}
        <section className="mt-5 glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Tutorial</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Reveja a apresentação cinemática de boas-vindas a qualquer momento.
          </p>
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={openTutorial}>
            <Sparkles className="w-3.5 h-3.5" /> Reabrir tutorial
          </Button>
        </section>

        {/* Conta */}
        <section className="mt-8 flex flex-col items-center gap-3">
          <Button variant="ghost" onClick={logout} className="gap-2">
            <LogOut className="w-4 h-4" /> Sair da conta
          </Button>
          <VersionTag />
        </section>
      </div>
    </AppShell>
  );
}
