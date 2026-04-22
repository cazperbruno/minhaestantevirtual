import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Timer, Play, Square, Trophy, Plus, Check } from "lucide-react";
import {
  useActiveSprint, useFinishSprint, useJoinSprint, useStartSprint, useUpdateSprintProgress,
} from "@/hooks/useReadingSprints";
import { cn } from "@/lib/utils";

interface Props {
  clubId: string;
  currentUserId: string | null;
  isOwner: boolean;
}

const DURATIONS = [15, 30, 45, 60] as const;

function fmtRemaining(ms: number) {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Painel compacto de Reading Sprint do clube (botão para iniciar quando não há ativa). */
export function ReadingSprintPanel({ clubId, currentUserId, isOwner }: Props) {
  const { sprint, participants } = useActiveSprint(clubId);
  const start = useStartSprint(clubId);
  const join = useJoinSprint();
  const update = useUpdateSprintProgress();
  const finish = useFinishSprint();

  const [openStart, setOpenStart] = useState(false);
  const [duration, setDuration] = useState<number>(30);
  const [pagesStart, setPagesStart] = useState("");
  const [openJoin, setOpenJoin] = useState(false);
  const [joinPages, setJoinPages] = useState("");
  const [endPages, setEndPages] = useState("");

  // Tick a cada segundo enquanto há sprint ativa
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!sprint) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [sprint]);

  const myPart = useMemo(
    () => participants.find((p) => p.user_id === currentUserId) ?? null,
    [participants, currentUserId],
  );

  // Pré-preenche endPages quando me torno participante
  useEffect(() => {
    if (myPart && endPages === "") {
      setEndPages(String(myPart.pages_end ?? myPart.pages_start));
    }
  }, [myPart, endPages]);

  if (!sprint) {
    return (
      <div className="glass rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Timer className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">Sprint de leitura</p>
            <p className="text-xs text-muted-foreground">
              Sessão cronometrada para todos lerem juntos.
            </p>
          </div>
        </div>

        <Dialog open={openStart} onOpenChange={setOpenStart}>
          <DialogTrigger asChild>
            <Button size="sm" variant="hero" className="gap-1.5">
              <Play className="w-3.5 h-3.5" /> Iniciar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo sprint de leitura</DialogTitle>
              <DialogDescription>
                Escolha o tempo. Todos os membros serão notificados.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-4 gap-2 pt-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={cn(
                    "rounded-xl py-3 text-sm font-semibold border transition-all",
                    duration === d
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 border-border hover:border-primary/40",
                  )}
                >
                  {d}min
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="sprint-pg-start">
                Página atual (opcional)
              </label>
              <Input
                id="sprint-pg-start"
                type="number"
                inputMode="numeric"
                placeholder="Ex: 120"
                value={pagesStart}
                onChange={(e) => setPagesStart(e.target.value)}
                className="mt-1"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpenStart(false)}>
                Cancelar
              </Button>
              <Button
                variant="hero"
                disabled={start.isPending}
                onClick={async () => {
                  const sid = await start.mutateAsync(duration);
                  if (sid && currentUserId) {
                    // Atualiza pages_start do criador (já entrou via RPC)
                    const ps = parseInt(pagesStart, 10);
                    if (!isNaN(ps) && ps > 0) {
                      await update
                        .mutateAsync({ sprintId: sid, userId: currentUserId, pagesEnd: ps })
                        .catch(() => null);
                    }
                  }
                  setOpenStart(false);
                  setPagesStart("");
                }}
              >
                Começar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Sprint ativa
  const total = sprint.duration_minutes * 60_000;
  const remaining = new Date(sprint.ends_at).getTime() - now;
  const elapsedPct = Math.min(100, Math.max(0, ((total - remaining) / total) * 100));
  const expired = remaining <= 0;
  const sortedParts = [...participants].sort((a, b) => b.pages_read - a.pages_read);
  const top = sortedParts[0];

  return (
    <div className="glass rounded-2xl p-4 border border-primary/30 space-y-3 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Timer className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm inline-flex items-center gap-1.5">
              Sprint em andamento
              {expired && <span className="text-[10px] uppercase text-amber-500 font-bold">expirou</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {sprint.duration_minutes} min · {participants.length} {participants.length === 1 ? "participante" : "participantes"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={cn("font-display text-2xl font-bold tabular-nums", expired && "text-amber-500")}>
            {fmtRemaining(remaining)}
          </p>
        </div>
      </div>

      <Progress value={elapsedPct} className="h-2" />

      {/* Líder do sprint */}
      {top && top.pages_read > 0 && (
        <div className="flex items-center gap-2 text-xs bg-primary/5 rounded-lg p-2">
          <Trophy className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground">Liderando:</span>
          <span className="font-semibold truncate">{top.profile?.display_name || "Leitor"}</span>
          <span className="text-primary font-bold ml-auto">{top.pages_read} págs.</span>
        </div>
      )}

      {/* Participantes */}
      {sortedParts.length > 0 && (
        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
          {sortedParts.map((p, idx) => (
            <li
              key={p.user_id}
              className="flex items-center gap-2 text-xs p-1.5 rounded-lg hover:bg-muted/30"
            >
              <span className="text-muted-foreground w-4 text-center">{idx + 1}</span>
              <Avatar className="w-6 h-6">
                <AvatarImage src={p.profile?.avatar_url || undefined} />
                <AvatarFallback className="text-[10px]">
                  {(p.profile?.display_name || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate">{p.profile?.display_name || "Leitor"}</span>
              <span className="font-semibold tabular-nums">{p.pages_read} págs.</span>
            </li>
          ))}
        </ul>
      )}

      {/* Ações */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        {!myPart && currentUserId && !expired && (
          <Dialog open={openJoin} onOpenChange={setOpenJoin}>
            <DialogTrigger asChild>
              <Button size="sm" variant="hero" className="gap-1.5 flex-1">
                <Plus className="w-3.5 h-3.5" /> Entrar no sprint
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Entrar no sprint</DialogTitle>
                <DialogDescription>Em qual página você está agora?</DialogDescription>
              </DialogHeader>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Página atual"
                value={joinPages}
                onChange={(e) => setJoinPages(e.target.value)}
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpenJoin(false)}>Cancelar</Button>
                <Button
                  variant="hero"
                  disabled={join.isPending}
                  onClick={async () => {
                    const ps = parseInt(joinPages, 10);
                    await join.mutateAsync({
                      sprintId: sprint.id,
                      userId: currentUserId,
                      pagesStart: isNaN(ps) ? 0 : ps,
                    });
                    setOpenJoin(false);
                    setJoinPages("");
                  }}
                >
                  Entrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {myPart && !expired && (
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Página atual"
              value={endPages}
              onChange={(e) => setEndPages(e.target.value)}
              className="h-9"
            />
            <Button
              size="sm"
              variant="hero"
              disabled={update.isPending}
              onClick={() => {
                const pe = parseInt(endPages, 10);
                if (isNaN(pe) || !currentUserId) return;
                update.mutate({ sprintId: sprint.id, userId: currentUserId, pagesEnd: pe });
              }}
              className="gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Atualizar
            </Button>
          </div>
        )}

        {(currentUserId === sprint.created_by || isOwner) && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            disabled={finish.isPending}
            onClick={() => finish.mutate(sprint.id)}
          >
            <Square className="w-3.5 h-3.5" /> Encerrar
          </Button>
        )}
      </div>
    </div>
  );
}
