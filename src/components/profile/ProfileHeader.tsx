import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Trophy, ExternalLink, Share2, Edit3 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface Props {
  profile: any;
  email?: string | null;
  publicHref: string;
  onEdit?: () => void;
}

export function ProfileHeader({ profile, email, publicHref, onEdit }: Props) {
  const share = async () => {
    const url = `${window.location.origin}${publicHref}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Perfil de ${profile.display_name || "leitor"} no Readify`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado!");
      }
    } catch {
      // user canceled
    }
  };

  const xpInLevel = (profile.xp ?? 0) % 100;
  const toNext = 100 - xpInLevel;

  return (
    <div className="animate-fade-in">
      <div className="flex items-start gap-4 sm:gap-5 min-w-0">
        <Avatar className="w-20 h-20 sm:w-24 sm:h-24 ring-2 ring-primary/30 shrink-0">
          <AvatarImage src={profile.avatar_url} />
          <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display text-2xl sm:text-3xl">
            {(profile.display_name || email || "?").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl sm:text-4xl font-bold leading-tight truncate">
            {profile.display_name || "Leitor"}
          </h1>
          {profile.username && (
            <p className="text-primary text-sm font-medium truncate">@{profile.username}</p>
          )}
          {profile.bio ? (
            <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{profile.bio}</p>
          ) : (
            <p className="text-muted-foreground/60 text-xs mt-1 italic">Adicione uma bio em Configurações</p>
          )}

          <div className="flex items-center gap-2 mt-2 text-xs">
            <Trophy className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-medium">Nível {profile.level ?? 1}</span>
            <span className="text-muted-foreground">· {profile.xp ?? 0} XP</span>
          </div>
          <div className="mt-1.5 max-w-xs">
            <Progress value={xpInLevel} className="h-1.5" />
            <p className="text-[10px] text-muted-foreground mt-1">
              {toNext} XP para o nível {(profile.level ?? 1) + 1}
            </p>
          </div>
        </div>
      </div>

      {/* Ações em linha — scroll horizontal em telas pequenas */}
      <div className="mt-5 -mx-1 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-2 px-1 min-w-max">
          <Button size="sm" variant="hero" onClick={onEdit} className="gap-1.5 shrink-0">
            <Edit3 className="w-3.5 h-3.5" /> Editar
          </Button>
          <Button size="sm" variant="outline" onClick={share} className="gap-1.5 shrink-0">
            <Share2 className="w-3.5 h-3.5" /> Compartilhar
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5 shrink-0">
            <Link to={publicHref}>
              <ExternalLink className="w-3.5 h-3.5" /> Ver público
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="shrink-0">
            <Link to="/desejos">Wishlist</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
