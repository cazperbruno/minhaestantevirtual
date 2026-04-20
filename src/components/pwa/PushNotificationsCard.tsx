import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * Card para ativar/desativar notificações push (Web Push API + VAPID).
 * Aparece no perfil. Não renderiza nada em ambientes não suportados (preview/iframe).
 */
export function PushNotificationsCard() {
  const { state, busy, supported, subscribe, unsubscribe } = usePushNotifications();

  if (!supported || state === "unsupported") return null;

  const isOn = state === "granted-subscribed";
  const isDenied = state === "denied";

  return (
    <div className="glass rounded-2xl p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
        isOn ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
      }`}>
        {isOn ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-tight">
          {isOn ? "Notificações push ativadas" : "Receber notificações push"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          {isDenied
            ? "Você bloqueou. Reative nas configurações do navegador."
            : isOn
              ? "Curtidas, comentários, novos seguidores e convites de clube."
              : "Mesmo com o app fechado — direto no seu dispositivo."}
        </p>
      </div>
      {isDenied ? (
        <Button variant="outline" size="sm" disabled className="gap-1.5">
          <BellOff className="w-3.5 h-3.5" /> Bloqueado
        </Button>
      ) : isOn ? (
        <Button variant="outline" size="sm" onClick={unsubscribe} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellOff className="w-3.5 h-3.5" />}
          Desativar
        </Button>
      ) : (
        <Button variant="hero" size="sm" onClick={subscribe} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
          Ativar
        </Button>
      )}
    </div>
  );
}
