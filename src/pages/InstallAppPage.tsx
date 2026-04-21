/**
 * Página dedicada para instalação do app (PWA leve).
 * - Hero com benefícios
 * - InstallAppCard (prompt nativo Android/Desktop, instruções iOS)
 * - Instruções passo-a-passo por plataforma
 * - FAQ rápido
 */
import { AppShell } from "@/components/layout/AppShell";
import { InstallAppCard } from "@/components/pwa/InstallAppCard";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { Smartphone, Zap, WifiOff, Bell, Share, Plus, Check, Chrome, Apple, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import readifyLogo from "@/assets/readify-logo-v8.png";

/** Limpa todos os caches do SW e força reload — last resort para usuários presos em versão antiga. */
async function forceFullUpdate() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {
    console.warn("[forceUpdate]", e);
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  }
}

export default function InstallAppPage() {
  const { platform, installed } = usePwaInstall();

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-10 pb-20 max-w-3xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-gold shadow-glow mb-5">
            <img src={readifyLogo} alt="Readify" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-3">
            Instale o Readify
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Tenha sua biblioteca a um toque na tela inicial — sem barra de navegador, com acesso rápido e experiência de app nativo.
          </p>
        </div>

        {/* Card de instalação principal */}
        <div className="mb-10 animate-scale-in">
          <InstallAppCard />
          {installed && (
            <p className="text-center text-xs text-muted-foreground mt-3">
              ✨ Você já está usando o Readify como aplicativo instalado.
            </p>
          )}
        </div>

        {/* Benefícios */}
        <section className="grid sm:grid-cols-2 gap-3 mb-10">
          <Benefit icon={<Zap className="w-5 h-5" />} title="Mais rápido" text="Abre instantaneamente, sem URL nem abas." />
          <Benefit icon={<Smartphone className="w-5 h-5" />} title="Tela cheia" text="Sem barra do navegador, como app nativo." />
          <Benefit icon={<WifiOff className="w-5 h-5" />} title="Funciona offline" text="Continue navegando mesmo sem internet." />
          <Benefit icon={<Bell className="w-5 h-5" />} title="Notificações" text="Receba avisos de novos seguidores e livros." />
        </section>

        {/* Instruções por plataforma */}
        <section className="space-y-5">
          <h2 className="font-display text-2xl font-bold">Como instalar</h2>

          <PlatformGuide
            platform="ios"
            active={platform === "ios"}
            icon={<Apple className="w-5 h-5" />}
            title="iPhone / iPad (Safari)"
            steps={[
              { icon: <Share className="w-4 h-4" />, text: "Toque no ícone de Compartilhar (seta para cima na barra inferior)" },
              { icon: <Plus className="w-4 h-4" />, text: "Role e toque em 'Adicionar à Tela de Início'" },
              { icon: <Check className="w-4 h-4" />, text: "Confirme — o ícone aparecerá como app nativo" },
            ]}
            note="Importante: precisa estar usando o Safari. Não funciona no Chrome ou Firefox no iOS."
          />

          <PlatformGuide
            platform="android"
            active={platform === "android"}
            icon={<Chrome className="w-5 h-5" />}
            title="Android (Chrome / Edge / Samsung Internet)"
            steps={[
              { icon: <Plus className="w-4 h-4" />, text: "Toque no botão 'Instalar' acima — ou no menu ⋮ do navegador" },
              { icon: <Check className="w-4 h-4" />, text: "Selecione 'Instalar aplicativo' ou 'Adicionar à tela inicial'" },
              { icon: <Smartphone className="w-4 h-4" />, text: "Pronto! O Readify aparecerá no seu menu de apps" },
            ]}
          />

          <PlatformGuide
            platform="desktop"
            active={platform === "desktop"}
            icon={<Chrome className="w-5 h-5" />}
            title="Computador (Chrome / Edge)"
            steps={[
              { icon: <Plus className="w-4 h-4" />, text: "Clique no ícone de instalação na barra de endereços (ao lado da URL)" },
              { icon: <Check className="w-4 h-4" />, text: "Confirme em 'Instalar'" },
              { icon: <Smartphone className="w-4 h-4" />, text: "O Readify abrirá em janela própria, como app desktop" },
            ]}
          />
        </section>

        {/* Forçar atualização — para usuários presos em versão antiga */}
        <section className="mt-10">
          <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold mb-1">App não atualiza?</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Se você está vendo uma versão antiga mesmo após recarregar, limpe o cache do app e recarregue tudo do zero.
                </p>
                <Button
                  variant="hero"
                  size="sm"
                  onClick={() => {
                    toast.info("Limpando cache e recarregando…");
                    void forceFullUpdate();
                  }}
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Forçar atualização agora
                </Button>
              </div>
            </div>
          </Card>
        </section>

        {/* FAQ */}
        <section className="mt-10 space-y-3">
          <h2 className="font-display text-2xl font-bold mb-2">Perguntas frequentes</h2>
          <Faq q="Preciso baixar da App Store ou Play Store?" a="Não. O Readify é um Progressive Web App (PWA) — instala direto pelo navegador, sem loja de apps." />
          <Faq q="Vai ocupar espaço no meu celular?" a="Quase nada. PWAs são leves e usam apenas alguns megabytes." />
          <Faq q="Posso desinstalar depois?" a="Sim, do mesmo jeito que qualquer app: pressione e segure o ícone e escolha desinstalar." />
          <Faq q="Funciona sem internet?" a="As páginas que você já visitou ficam disponíveis offline. Sincroniza ao reconectar." />
          <Faq q="O app não atualiza, o que faço?" a="Use o botão 'Forçar atualização agora' acima. Ele limpa todo o cache e recarrega a versão mais recente." />
        </section>
      </div>
    </AppShell>
  );
}

function Benefit({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card className="p-4 flex items-start gap-3 hover:border-primary/40 transition-colors">
      <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="font-display font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground leading-snug">{text}</p>
      </div>
    </Card>
  );
}

function PlatformGuide({
  icon,
  title,
  steps,
  note,
  active,
}: {
  platform: string;
  active: boolean;
  icon: React.ReactNode;
  title: string;
  steps: { icon: React.ReactNode; text: string }[];
  note?: string;
}) {
  return (
    <Card className={`p-5 transition-all ${active ? "border-primary/50 ring-1 ring-primary/20 shadow-glow" : ""}`}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
          {icon}
        </div>
        <h3 className="font-display font-semibold">{title}</h3>
        {active && (
          <span className="ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
            Você está aqui
          </span>
        )}
      </div>
      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-muted text-foreground flex items-center justify-center shrink-0 font-display font-bold text-xs tabular-nums">
              {i + 1}
            </div>
            <p className="text-sm leading-snug flex items-start gap-2 flex-1">
              <span className="text-primary mt-0.5 shrink-0">{s.icon}</span>
              <span>{s.text}</span>
            </p>
          </li>
        ))}
      </ol>
      {note && (
        <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border/50">
          💡 {note}
        </p>
      )}
    </Card>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors">
      <summary className="cursor-pointer font-medium text-sm flex items-center justify-between gap-2 list-none">
        <span>{q}</span>
        <span className="text-primary transition-transform group-open:rotate-45 text-lg leading-none">+</span>
      </summary>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{a}</p>
    </details>
  );
}
