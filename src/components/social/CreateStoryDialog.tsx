import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Quote, BookOpen, Trophy, Sparkles } from "lucide-react";
import { useCreateStory, type StoryBg, type StoryKind } from "@/hooks/useStories";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const BG_OPTIONS: { id: StoryBg; label: string; classes: string }[] = [
  { id: "gradient-gold",   label: "Dourado", classes: "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600" },
  { id: "gradient-night",  label: "Noite",   classes: "bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-950" },
  { id: "gradient-sunset", label: "Sunset",  classes: "bg-gradient-to-br from-pink-500 via-orange-400 to-yellow-300" },
  { id: "gradient-ocean",  label: "Oceano",  classes: "bg-gradient-to-br from-cyan-500 via-sky-600 to-indigo-700" },
  { id: "gradient-forest", label: "Floresta",classes: "bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900" },
];

const KIND_OPTIONS: { id: StoryKind; label: string; icon: React.ReactNode }[] = [
  { id: "quote",          label: "Citação",       icon: <Quote className="w-4 h-4" /> },
  { id: "progress",       label: "Progresso",     icon: <BookOpen className="w-4 h-4" /> },
  { id: "milestone",      label: "Conquista",     icon: <Trophy className="w-4 h-4" /> },
  { id: "recommendation", label: "Recomendação",  icon: <Sparkles className="w-4 h-4" /> },
];

export function CreateStoryDialog({
  open,
  onOpenChange,
  bookId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookId?: string;
}) {
  const [kind, setKind] = useState<StoryKind>("quote");
  const [bg, setBg] = useState<StoryBg>("gradient-gold");
  const [content, setContent] = useState("");
  const create = useCreateStory();

  const submit = async () => {
    if (!content.trim()) {
      toast.error("Escreva algo para sua story");
      return;
    }
    try {
      await create.mutateAsync({
        kind,
        bg_color: bg,
        content: content.trim(),
        book_id: bookId ?? null,
      });
      toast.success("Story publicada por 24h ✨");
      setContent("");
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível publicar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Criar story</DialogTitle>
        </DialogHeader>

        {/* Tipo */}
        <div className="flex gap-2 flex-wrap">
          {KIND_OPTIONS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                kind === k.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/50 border-border hover:border-primary/40",
              )}
            >
              {k.icon} {k.label}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div
          className={cn(
            "rounded-2xl aspect-[9/14] flex items-center justify-center p-6 text-center transition-colors",
            BG_OPTIONS.find((b) => b.id === bg)?.classes,
          )}
        >
          <p className="font-display text-xl font-bold text-white drop-shadow-lg leading-tight max-w-[240px]">
            {content.trim() || (kind === "quote" ? "Sua citação aqui…" : "Seu texto aqui…")}
          </p>
        </div>

        {/* Cor */}
        <div className="flex gap-2 flex-wrap">
          {BG_OPTIONS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBg(b.id)}
              className={cn(
                "w-10 h-10 rounded-full border-2 transition-all",
                b.classes,
                bg === b.id ? "border-foreground scale-110" : "border-transparent",
              )}
              aria-label={b.label}
            />
          ))}
        </div>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, 240))}
          placeholder={kind === "quote" ? "A citação que te marcou…" : "Compartilhe um momento da leitura…"}
          rows={3}
          className="resize-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{content.length}/240 · Expira em 24h</span>
          <Button onClick={submit} disabled={create.isPending} variant="hero">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publicar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
