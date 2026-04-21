import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFollowingStoriesAuthors } from "@/hooks/useStories";
import { useAuth } from "@/hooks/useAuth";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { StoriesViewer } from "./StoriesViewer";
import { CreateStoryDialog } from "./CreateStoryDialog";

/**
 * Barra horizontal de stories estilo Instagram, no topo da Discover.
 * Abre viewer full-screen ao clicar; abre composer ao clicar no "+".
 */
export function StoriesBar() {
  const { user } = useAuth();
  const { data: authors = [], isLoading } = useFollowingStoriesAuthors();
  const [openAuthor, setOpenAuthor] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shrink-0 w-16 h-16 rounded-full bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  // Sempre mostra o "+" do usuário no início
  const myAuthor = authors.find((a) => a.user_id === user?.id);
  const others = authors.filter((a) => a.user_id !== user?.id);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 px-1 -mx-1">
        {/* Botão "Criar story" / sua própria story */}
        <button
          onClick={() => {
            if (myAuthor) setOpenAuthor(myAuthor.user_id);
            else setComposerOpen(true);
          }}
          className="shrink-0 flex flex-col items-center gap-1.5 group"
          aria-label={myAuthor ? "Ver suas stories" : "Criar story"}
        >
          <div className="relative">
            <Avatar
              className={cn(
                "w-16 h-16 ring-2 transition-all",
                myAuthor?.has_unseen
                  ? "ring-primary ring-offset-2 ring-offset-background"
                  : "ring-border/60",
              )}
            >
              <AvatarImage src={user?.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display">
                {(user?.email ?? "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center group-hover:scale-110 transition-transform">
              <Plus className="w-3.5 h-3.5" />
            </div>
          </div>
          <span className="text-[10px] font-medium text-muted-foreground max-w-[64px] truncate">
            {myAuthor ? "Sua story" : "Criar"}
          </span>
        </button>

        {others.map((a) => (
          <button
            key={a.user_id}
            onClick={() => setOpenAuthor(a.user_id)}
            className="shrink-0 flex flex-col items-center gap-1.5 group"
            aria-label={`Ver stories de ${a.display_name ?? a.username ?? "leitor"}`}
          >
            <div
              className={cn(
                "p-[2px] rounded-full transition-transform group-hover:scale-105",
                a.has_unseen
                  ? "bg-gradient-to-tr from-primary via-fuchsia-400 to-amber-400"
                  : "bg-muted/40",
              )}
            >
              <Avatar className="w-16 h-16 ring-2 ring-background">
                <AvatarImage src={a.avatar_url ?? undefined} />
                <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display">
                  {(a.display_name ?? a.username ?? "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <span className="text-[10px] font-medium text-foreground max-w-[64px] truncate">
              {a.display_name ?? a.username ?? "Leitor"}
            </span>
          </button>
        ))}
      </div>

      {openAuthor && (
        <StoriesViewer
          authors={authors}
          initialAuthorId={openAuthor}
          onClose={() => setOpenAuthor(null)}
        />
      )}
      {composerOpen && <CreateStoryDialog open={composerOpen} onOpenChange={setComposerOpen} />}
    </>
  );
}
