import { useState } from "react";
import { Download, Share, Plus, Smartphone, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

/**
 * Card para instalação do app (PWA).
 * - Android/Desktop com prompt disponível → botão dispara o prompt nativo.
 * - iOS → abre dialog com passo a passo "Compartilhar → Adicionar à Tela de Início".
 * - Quando o app já está instalado (standalone), oculta o card.
 */
export function InstallAppCard() {
  const { canInstall, installed, platform, requiresManual, promptInstall } = usePwaInstall();
  const [iosOpen, setIosOpen] = useState(false);

  if (installed) {
    return (
      <div className="glass rounded-2xl p-5 flex items-center gap-4 border border-status-read/30">
        <div className="w-11 h-11 rounded-xl bg-status-read/15 text-status-read flex items-center justify-center">
          <Check className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="font-display font-semibold">App instalado</p>
          <p className="text-xs text-muted-foreground">Você está usando Página em modo aplicativo. Curta a leitura.</p>
        </div>
      </div>
    );
  }

  if (!canInstall) return null;

  const handleClick = async () => {
    if (requiresManual) {
      setIosOpen(true);
      return;
    }
    const r = await promptInstall();
    if (r === "accepted") toast.success("App instalado!");
    if (r === "unavailable") toast.info("Use o menu do navegador → 'Instalar aplicativo'");
  };

  return (
    <>
      <div className="glass rounded-2xl p-5 flex items-center gap-4 border border-primary/30 shadow-glow">
        <div className="w-11 h-11 rounded-xl bg-gradient-gold text-primary-foreground flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold">Instalar aplicativo</p>
          <p className="text-xs text-muted-foreground">
            Acesso rápido na tela inicial, sem barra do navegador, com suporte offline.
          </p>
        </div>
        <Button variant="hero" size="sm" onClick={handleClick} className="gap-2 shrink-0">
          <Download className="w-4 h-4" />
          Instalar
        </Button>
      </div>

      <Dialog open={iosOpen} onOpenChange={setIosOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" /> Instalar no iPhone
            </DialogTitle>
            <DialogDescription>
              No iOS, a instalação é feita pelo Safari em 3 passos:
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 mt-2">
            <Step n={1} icon={<Share className="w-4 h-4" />} text="Toque no ícone de Compartilhar (ícone de seta para cima na barra inferior)" />
            <Step n={2} icon={<Plus className="w-4 h-4" />} text="Role e toque em 'Adicionar à Tela de Início'" />
            <Step n={3} icon={<Check className="w-4 h-4" />} text="Confirme — o ícone aparecerá no seu iPhone como um app nativo" />
          </ol>
          <p className="text-[11px] text-muted-foreground mt-2">
            Dica: precisa estar usando o Safari. Não funciona em Chrome ou Firefox no iOS por limitações da Apple.
          </p>
          <Button variant="outline" onClick={() => setIosOpen(false)} className="gap-2 mt-2">
            <X className="w-4 h-4" /> Entendi
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Step({ n, icon, text }: { n: number; icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 font-display font-bold text-sm">
        {n}
      </div>
      <div className="flex-1">
        <p className="text-sm leading-snug flex items-start gap-2">
          <span className="text-primary mt-0.5">{icon}</span>
          <span>{text}</span>
        </p>
      </div>
    </li>
  );
}
