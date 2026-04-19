import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Flame, Calendar, BookOpen } from "lucide-react";
import { toast } from "sonner";

export default function GoalsPage() {
  const { user } = useAuth();
  const year = new Date().getFullYear();
  const [target, setTarget] = useState<number>(12);
  const [draft, setDraft] = useState("12");
  const [finished, setFinished] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31T23:59:59`;
      const [{ data: goal }, { count }, { data: streakData }] = await Promise.all([
        supabase.from("reading_goals").select("*").eq("user_id", user.id).eq("year", year).maybeSingle(),
        supabase
          .from("user_books")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "read")
          .gte("finished_at", start)
          .lte("finished_at", end),
        supabase.rpc("reading_streak", { _user_id: user.id }),
      ]);
      if (goal) {
        setTarget(goal.target_books);
        setDraft(String(goal.target_books));
      }
      setFinished(count || 0);
      setStreak((streakData as unknown as number) ?? 0);
      setLoading(false);
    })();
  }, [user, year]);

  const save = async () => {
    if (!user) return;
    const n = parseInt(draft, 10);
    if (!n || n < 1 || n > 1000) return toast.error("Meta entre 1 e 1000");
    setSaving(true);
    const { error } = await supabase
      .from("reading_goals")
      .upsert({ user_id: user.id, year, target_books: n }, { onConflict: "user_id,year" });
    if (error) toast.error("Erro ao salvar");
    else {
      setTarget(n);
      toast.success("Meta atualizada");
    }
    setSaving(false);
  };

  const progress = target ? Math.min(100, Math.round((finished / target) * 100)) : 0;
  const remaining = Math.max(0, target - finished);
  const monthsLeft = 12 - new Date().getMonth();
  const pace = remaining > 0 ? (remaining / Math.max(1, monthsLeft)).toFixed(1) : "0";

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-3xl mx-auto">
        <header className="mb-8 animate-fade-in">
          <h1 className="font-display text-4xl font-bold text-gradient-gold flex items-center gap-3">
            <Target className="w-8 h-8 text-primary" /> Metas {year}
          </h1>
          <p className="text-muted-foreground mt-1">Acompanhe seu hábito de leitura</p>
        </header>

        {loading ? (
          <div className="space-y-6 animate-fade-in">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Anual */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="font-display text-xl font-semibold">Meta anual</h2>
                <span className="font-display text-3xl font-bold text-primary">
                  {finished}<span className="text-muted-foreground text-base">/{target}</span>
                </span>
              </div>
              <Progress value={progress} className="h-3 mb-3" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{progress}% concluído</span>
                <span>{remaining > 0 ? `Faltam ${remaining}` : "Meta batida! 🎉"}</span>
              </div>
              {remaining > 0 && (
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Ritmo necessário: <strong className="text-foreground">{pace}</strong> livros/mês
                </p>
              )}
            </div>

            {/* Streak */}
            <div className="glass rounded-2xl p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Flame className={`w-7 h-7 ${streak > 0 ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <p className="font-display text-2xl font-bold">{streak} {streak === 1 ? "dia" : "dias"}</p>
                <p className="text-sm text-muted-foreground">Sequência de atividade</p>
              </div>
            </div>

            {/* Editar meta */}
            <div className="glass rounded-2xl p-6 space-y-3">
              <Label htmlFor="target" className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> Quantos livros em {year}?
              </Label>
              <div className="flex gap-2">
                <Input
                  id="target"
                  type="number"
                  min={1}
                  max={1000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="max-w-[120px]"
                />
                <Button variant="hero" onClick={save} disabled={saving}>Salvar</Button>
              </div>
              <p className="text-xs text-muted-foreground">Você pode atualizar sua meta a qualquer momento.</p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
