import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Activity, MessageCircle, UserPlus, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useClubRecentActivity } from "@/hooks/useClubDiscovery";
import { profilePath } from "@/lib/profile-path";

interface Props {
  clubId: string;
  isMember: boolean;
}

/** Painel de atividade recente do clube (Wave 1: mensagens + novos membros). */
export function ClubActivityPanel({ clubId, isMember }: Props) {
  const { data, isLoading } = useClubRecentActivity(clubId, isMember, 6);

  if (!isMember) return null;

  return (
    <section className="glass rounded-2xl p-4 md:p-5 mb-4">
      <h3 className="font-display text-sm font-bold flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-primary" /> Atividade recente
      </h3>
      {isLoading ? (
        <div className="py-4 flex justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">
          Nada acontecendo ainda. Seja o primeiro a comentar!
        </p>
      ) : (
        <ul className="space-y-2.5">
          {data.map((item, idx) => {
            const Icon = item.kind === "message" ? MessageCircle : UserPlus;
            const name = item.profile?.display_name || "Leitor";
            const verb =
              item.kind === "message" ? "comentou" : "entrou no clube";
            const link = item.profile?.username
              ? profilePath(item.profile.username)
              : undefined;
            return (
              <li key={`${item.kind}-${idx}-${item.at}`} className="flex items-start gap-3">
                <Avatar className="w-7 h-7 shrink-0 mt-0.5">
                  <AvatarImage src={item.profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {link ? (
                      <Link to={link} className="font-semibold hover:text-primary transition-colors">
                        {name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{name}</span>
                    )}
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <Icon className="w-3 h-3" /> {verb}
                    </span>
                    <span className="text-muted-foreground/70">
                      · {formatDistanceToNow(new Date(item.at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  {item.kind === "message" && item.payload?.preview && (
                    <p className="text-muted-foreground line-clamp-1 mt-0.5 italic">
                      "{item.payload.preview}"
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
