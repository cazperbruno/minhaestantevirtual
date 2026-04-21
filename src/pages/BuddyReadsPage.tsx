/**
 * BuddyReadsPage — lista todas as leituras compartilhadas do usuário,
 * agrupadas por status (pendentes, ativas, concluídas).
 */
import { useBuddyReads, useAcceptBuddyRead, useDeclineBuddyRead, type BuddyReadSummary } from "@/hooks/useBuddyReads";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, BookOpen, Trophy, Loader2 } from "lucide-react";

export default function BuddyReadsPage() {
  const { data = [], isLoading } = useBuddyReads();
  const accept = useAcceptBuddyRead();
  const decline = useDeclineBuddyRead();

  const pending   = data.filter((b) => b.status === "pending" && !b.is_initiator);
  const sent      = data.filter((b) => b.status === "pending" && b.is_initiator);
  const active    = data.filter((b) => b.status === "active");
  const completed = data.filter((b) => b.status === "completed");

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Users className="w-7 h-7 text-primary" /> Buddy Reading
        </h1>
        <p className="text-sm text-muted-foreground">Leia livros junto com seus amigos e conquiste badges.</p>
      </header>

      {!isLoading && data.length === 0 && (
        <EmptyState
          icon={<Users />}
          title="Nenhuma leitura compartilhada ainda"
          description="Abra qualquer livro e use 'Convidar pra ler junto' para começar."
        />
      )}

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Convites recebidos</h2>
          {pending.map((b) => (
            <Card key={b.id} className="p-4 flex items-center gap-3">
              <BookCover b={b} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{b.book_title}</p>
                <p className="text-xs text-muted-foreground">de {b.partner_name ?? "alguém"}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => decline.mutate(b.id)} disabled={decline.isPending && decline.variables === b.id}>
                {decline.isPending && decline.variables === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Recusar"}
              </Button>
              <Button size="sm" onClick={() => accept.mutate(b.id)} disabled={accept.isPending && accept.variables === b.id}>
                {accept.isPending && accept.variables === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Aceitar"}
              </Button>
            </Card>
          ))}
        </section>
      )}

      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Leituras ativas</h2>
          {active.map((b) => <BuddyCard key={b.id} b={b} />)}
        </section>
      )}

      {sent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Convites enviados</h2>
          {sent.map((b) => (
            <Card key={b.id} className="p-3 flex items-center gap-3 opacity-80">
              <BookCover b={b} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{b.book_title}</p>
                <p className="text-xs text-muted-foreground">aguardando {b.partner_name}</p>
              </div>
              <Badge variant="outline">Pendente</Badge>
            </Card>
          ))}
        </section>
      )}

      {completed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> Concluídas
          </h2>
          {completed.map((b) => <BuddyCard key={b.id} b={b} compact />)}
        </section>
      )}
    </div>
  );
}

function BookCover({ b }: { b: BuddyReadSummary }) {
  return b.book_cover ? (
    <img src={b.book_cover} alt={b.book_title} className="w-12 h-16 object-cover rounded" loading="lazy" />
  ) : (
    <div className="w-12 h-16 rounded bg-muted flex items-center justify-center">
      <BookOpen className="w-5 h-5 text-muted-foreground" />
    </div>
  );
}

function BuddyCard({ b, compact = false }: { b: BuddyReadSummary; compact?: boolean }) {
  return (
    <Link to={`/buddy/${b.id}`}>
      <Card className="p-4 flex items-center gap-4 hover:border-primary/40 transition">
        <BookCover b={b} />
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className="font-medium truncate">{b.book_title}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Avatar className="w-4 h-4"><AvatarImage src={b.partner_avatar ?? undefined} /><AvatarFallback>?</AvatarFallback></Avatar>
              {b.partner_name ?? "Parceiro"}
            </div>
          </div>
          {!compact && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Você</span>
                <span className="font-medium">{Math.round(Number(b.my_percent))}%</span>
              </div>
              <Progress value={Number(b.my_percent)} className="h-1.5" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{b.partner_name?.split(" ")[0] ?? "Amigo"}</span>
                <span className="font-medium">{Math.round(Number(b.partner_percent))}%</span>
              </div>
              <Progress value={Number(b.partner_percent)} className="h-1.5" />
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
