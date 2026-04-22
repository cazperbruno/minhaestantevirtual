import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Heart, MessageCircle, TrendingUp } from "lucide-react";
import { MetricCard } from "./MetricCard";

interface FeedStats {
  total: number;
  last_minute: number;
  last_hour: number;
  today: number;
  likes_today: number;
  comments_today: number;
}

const ZERO: FeedStats = {
  total: 0, last_minute: 0, last_hour: 0, today: 0,
  likes_today: 0, comments_today: 0,
};

interface RealtimeRow {
  kind: string;
  created_at: string;
  user_id: string;
}

/**
 * Aba Feed Social — métricas + stream realtime do feed para validar fluxo.
 */
export function FeedTab() {
  const [stats, setStats] = useState<FeedStats>(ZERO);
  const [recent, setRecent] = useState<RealtimeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const load = async () => {
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const minAgo = new Date(Date.now() - 60_000).toISOString();
    const head = (q: any) => q.select("id", { count: "exact", head: true });
    const [total, today, lastHour, lastMin, likesToday, commentsToday, recentR] = await Promise.all([
      head(supabase.from("activities")),
      head(supabase.from("activities").gte("created_at", dayAgo)),
      head(supabase.from("activities").gte("created_at", hourAgo)),
      head(supabase.from("activities").gte("created_at", minAgo)),
      head(supabase.from("activity_likes").gte("created_at", dayAgo)),
      head(supabase.from("activity_comments").gte("created_at", dayAgo)),
      supabase.from("activities").select("kind, created_at, user_id").order("created_at", { ascending: false }).limit(15),
    ]);
    setStats({
      total: total.count ?? 0,
      today: today.count ?? 0,
      last_hour: lastHour.count ?? 0,
      last_minute: lastMin.count ?? 0,
      likes_today: likesToday.count ?? 0,
      comments_today: commentsToday.count ?? 0,
    });
    setRecent(((recentR.data as any[]) || []) as RealtimeRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 15_000);
    const ch = supabase
      .channel("admin_feed_pulse")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, (payload) => {
        setRecent((prev) => [payload.new as any, ...prev].slice(0, 15));
        setStats((s) => ({ ...s, total: s.total + 1, today: s.today + 1, last_hour: s.last_hour + 1, last_minute: s.last_minute + 1 }));
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => {
      clearInterval(interval);
      void supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-display text-2xl font-bold flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Feed Social
        </h2>
        <Badge variant="outline" className={connected ? "text-success border-success/40" : "text-warning border-warning/40"}>
          {connected ? "● realtime conectado" : "○ aguardando realtime"}
        </Badge>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={<Activity className="w-3.5 h-3.5" />}
          label="Total atividades"
          value={stats.total}
          loading={loading}
        />
        <MetricCard
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="Última hora"
          value={stats.last_hour}
          hint={`${stats.last_minute} no último minuto`}
          loading={loading}
          tone={stats.last_minute > 0 ? "success" : "default"}
        />
        <MetricCard
          icon={<Heart className="w-3.5 h-3.5" />}
          label="Curtidas (24h)"
          value={stats.likes_today}
          loading={loading}
        />
        <MetricCard
          icon={<MessageCircle className="w-3.5 h-3.5" />}
          label="Comentários (24h)"
          value={stats.comments_today}
          loading={loading}
        />
      </section>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold text-sm">Atividades em tempo real</h3>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem atividades ainda.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {recent.map((r, i) => (
              <li key={`${r.user_id}-${r.created_at}-${i}`} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  <Badge variant="outline" className="text-[10px]">{r.kind}</Badge>
                  <span className="text-muted-foreground text-xs font-mono truncate max-w-[140px]">{r.user_id.slice(0, 8)}…</span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleTimeString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
