import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { useAuthorStories, useMarkStoryViewed, type StoryAuthor, type StoryBg } from "@/hooks/useStories";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookCover } from "@/components/books/BookCover";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const STORY_DURATION_MS = 5500;

const BG_CLASS: Record<StoryBg, string> = {
  "gradient-gold":   "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600",
  "gradient-night":  "bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-950",
  "gradient-sunset": "bg-gradient-to-br from-pink-500 via-orange-400 to-yellow-300",
  "gradient-ocean":  "bg-gradient-to-br from-cyan-500 via-sky-600 to-indigo-700",
  "gradient-forest": "bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900",
};

interface Props {
  authors: StoryAuthor[];
  initialAuthorId: string;
  onClose: () => void;
}

/**
 * Viewer full-screen estilo Instagram. Tap pra avançar, swipe/seta pra trocar autor.
 * Marca como visto automaticamente.
 */
export function StoriesViewer({ authors, initialAuthorId, onClose }: Props) {
  const [authorIdx, setAuthorIdx] = useState(() =>
    Math.max(0, authors.findIndex((a) => a.user_id === initialAuthorId)),
  );
  const [storyIdx, setStoryIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(performance.now());
  const elapsedRef = useRef(0);

  const author = authors[authorIdx];
  const { data: stories = [] } = useAuthorStories(author?.user_id ?? null);
  const story = stories[storyIdx];
  const markViewed = useMarkStoryViewed();

  // Marca como visto ao entrar em cada story
  useEffect(() => {
    if (story) markViewed.mutate(story.id);
    setProgress(0);
    elapsedRef.current = 0;
    startedAtRef.current = performance.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  // Reset story idx ao trocar de autor
  useEffect(() => {
    setStoryIdx(0);
  }, [authorIdx]);

  // Loop de progresso
  useEffect(() => {
    if (!story) return;
    const tick = (t: number) => {
      if (!paused) {
        const delta = t - startedAtRef.current;
        const total = elapsedRef.current + delta;
        const p = Math.min(1, total / STORY_DURATION_MS);
        setProgress(p);
        if (p >= 1) {
          next();
          return;
        }
      } else {
        startedAtRef.current = t;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    startedAtRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, paused]);

  const next = () => {
    if (storyIdx < stories.length - 1) {
      setStoryIdx((i) => i + 1);
    } else if (authorIdx < authors.length - 1) {
      setAuthorIdx((i) => i + 1);
    } else {
      onClose();
    }
  };

  const prev = () => {
    if (storyIdx > 0) setStoryIdx((i) => i - 1);
    else if (authorIdx > 0) setAuthorIdx((i) => i - 1);
  };

  // Atalhos teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyIdx, authorIdx, stories.length]);

  if (!author) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex items-center justify-center animate-fade-in">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-background/60 hover:bg-background border border-border flex items-center justify-center"
        aria-label="Fechar"
      >
        <X className="w-5 h-5" />
      </button>

      <div
        className={cn(
          "relative w-full h-full md:w-[420px] md:h-[88vh] md:rounded-3xl overflow-hidden shadow-2xl",
          BG_CLASS[story?.bg_color ?? "gradient-gold"],
        )}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 z-10 flex gap-1">
          {stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-white transition-[width] duration-100"
                style={{
                  width: i < storyIdx ? "100%" : i === storyIdx ? `${progress * 100}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* Author */}
        <div className="absolute top-7 left-3 right-14 z-10 flex items-center gap-2 mt-3">
          <Avatar className="w-8 h-8 ring-2 ring-white/60">
            <AvatarImage src={author.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs bg-white/20 text-white">
              {(author.display_name ?? "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white drop-shadow truncate">
              {author.display_name ?? author.username ?? "Leitor"}
            </p>
            {story && (
              <p className="text-[10px] text-white/80 drop-shadow">
                {formatDistanceToNow(new Date(story.created_at), { addSuffix: true, locale: ptBR })}
              </p>
            )}
          </div>
        </div>

        {/* Tap zones */}
        <button
          onClick={prev}
          className="absolute left-0 top-0 bottom-0 w-1/3 z-[5]"
          aria-label="Anterior"
        />
        <button
          onClick={next}
          className="absolute right-0 top-0 bottom-0 w-1/3 z-[5]"
          aria-label="Próximo"
        />

        {/* Content */}
        {story && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
            {story.book && (
              <Link
                to={`/livro/${story.book.id}`}
                onClick={onClose}
                className="mb-6 group/book"
              >
                <BookCover book={story.book} size="md" interactive={false} className="shadow-2xl group-hover/book:scale-105 transition-transform" />
              </Link>
            )}

            {story.kind === "quote" && story.content && (
              <blockquote className="font-display text-2xl md:text-3xl font-bold text-white leading-tight drop-shadow-lg max-w-sm">
                &ldquo;{story.content}&rdquo;
              </blockquote>
            )}

            {story.kind === "progress" && (
              <div className="text-white max-w-sm">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-90" />
                <p className="font-display text-xl font-bold drop-shadow">
                  {story.book?.title ?? "Lendo agora"}
                </p>
                {story.current_page && story.total_pages && (
                  <>
                    <p className="font-display text-5xl font-bold mt-3 drop-shadow-lg">
                      {Math.round((story.current_page / story.total_pages) * 100)}%
                    </p>
                    <p className="text-sm opacity-90 mt-1">
                      pág {story.current_page} de {story.total_pages}
                    </p>
                  </>
                )}
                {story.content && <p className="mt-4 text-sm opacity-90">{story.content}</p>}
              </div>
            )}

            {(story.kind === "milestone" || story.kind === "recommendation") && story.content && (
              <p className="font-display text-2xl font-bold text-white drop-shadow-lg max-w-sm">
                {story.content}
              </p>
            )}

            {story.book && (
              <p className="mt-4 text-xs text-white/80 italic max-w-sm line-clamp-1">
                {story.book.authors?.[0] ? `— ${story.book.authors[0]}` : ""}
              </p>
            )}
          </div>
        )}

        {/* Author nav */}
        {authorIdx > 0 && (
          <button
            onClick={() => setAuthorIdx((i) => i - 1)}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background/60 border border-border items-center justify-center z-20"
            aria-label="Autor anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {authorIdx < authors.length - 1 && (
          <button
            onClick={() => setAuthorIdx((i) => i + 1)}
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background/60 border border-border items-center justify-center z-20"
            aria-label="Próximo autor"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
