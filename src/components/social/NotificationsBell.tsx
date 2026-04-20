import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Bell, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, Notif,
} from "@/hooks/useNotifications";

export function NotificationsBell({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: items = [], isLoading } = useNotifications();
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unread = items.filter((n) => !n.is_read).length;

  if (!user) return null;

  const handleClick = (n: Notif) => {
    if (!n.is_read) markOne.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = () => {
    const ids = items.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length > 0) markAll.mutate(ids);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Notificações"
          className={cn(
            "relative inline-flex items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent",
            compact ? "h-9 w-9" : "h-10 w-10",
          )}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0 max-h-[500px] flex flex-col" align="end">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="font-display font-semibold">Notificações</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAll} className="text-xs gap-1.5 h-7">
              <Check className="w-3 h-3" /> Marcar todas
            </Button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10 italic">Nada novo por aqui ainda.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/40 last:border-0 flex gap-3",
                      !n.is_read && "bg-primary/5",
                    )}
                  >
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
