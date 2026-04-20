import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchBooksGet, saveBook } from "@/lib/books-api";
import { Book } from "@/types/book";
import { BookCover } from "@/components/books/BookCover";
import { Loader2, Sparkles, Check, ArrowRight, Target } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CONTENT_TYPE_ICON, CONTENT_TYPE_LABEL, type ContentType } from "@/types/book";

const CONTENT_TYPES: ContentType[] = ["book", "manga", "comic", "magazine"];

const GENRES = [
  "Ficção", "Romance", "Suspense", "Fantasia", "Ficção científica",
  "Mistério", "Biografia", "História", "Filosofia", "Autoajuda",
  "Negócios", "Poesia", "Clássicos", "Distopia", "Aventura",
  "Drama", "Quadrinhos", "Tecnologia", "Psicologia", "Espiritualidade",
];

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [contentTypes, setContentTypes] = useState<ContentType[]>(["book"]);
  const [genres, setGenres] = useState<string[]>([]);
  const [picks, setPicks] = useState<Book[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [searching, setSearching] = useState(false);
  const [goal, setGoal] = useState(12);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles")
        .select("onboarded_at").eq("id", user.id).maybeSingle();
      if (data?.onboarded_at) navigate("/", { replace: true });
    })();
  }, [user, navigate]);

  // Search books — agora etapa 2
  useEffect(() => {
    if (step !== 2 || search.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchBooksGet(search);
        setResults(r.slice(0, 12));
      } catch {
        setResults([]);
      } finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [search, step]);

  const toggleContentType = (t: ContentType) => {
    setContentTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };
  const toggleGenre = (g: string) => {
    setGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  };
  const togglePick = (b: Book) => {
    setPicks((prev) => prev.find((x) => x.id === b.id)
      ? prev.filter((x) => x.id !== b.id)
      : [...prev, b]);
  };

  const finish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const year = new Date().getFullYear();
      const persistedIds: string[] = [];
      for (const b of picks) {
        const saved = b.id && !b.id.startsWith("ext_") ? b : await saveBook(b);
        if (saved?.id) persistedIds.push(saved.id);
      }

      await Promise.all([
        supabase.from("profiles").update({
          favorite_genres: genres,
          content_types: contentTypes.length > 0 ? contentTypes : ["book"],
          onboarded_at: new Date().toISOString(),
        }).eq("id", user.id),
        persistedIds.length > 0
          ? supabase.from("user_books").upsert(
              persistedIds.map((book_id) => ({
                user_id: user.id,
                book_id,
                status: "wishlist" as const,
                is_public: true,
              })),
              { onConflict: "user_id,book_id" },
            )
          : Promise.resolve(),
        supabase.from("reading_goals").upsert({
          user_id: user.id,
          year,
          target_books: goal,
        }, { onConflict: "user_id,year" } as any),
      ]);
      window.dispatchEvent(new CustomEvent("onboarding:completed"));
      toast.success("Tudo pronto!");
      navigate("/", { replace: true });
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    if (!user) return;
    await supabase.from("profiles").update({
      onboarded_at: new Date().toISOString(),
    }).eq("id", user.id);
    window.dispatchEvent(new CustomEvent("onboarding:completed"));
    navigate("/", { replace: true });
  };

  // Pula etapa de "livros pra ler" se usuário não curte livros
  const goNextFromGenres = () => {
    if (contentTypes.includes("book")) setStep(2);
    else setStep(3);
  };
  const goBackFromGoal = () => {
    if (contentTypes.includes("book")) setStep(2);
    else setStep(1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="px-6 pt-8 flex items-center justify-between max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-500",
                i === step ? "w-8 bg-primary" : i < step ? "w-1.5 bg-primary/60" : "w-1.5 bg-muted",
              )}
            />
          ))}
        </div>
        <button onClick={skip} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Pular
        </button>
      </header>

      <main className="flex-1 flex flex-col px-6 py-8 max-w-2xl mx-auto w-full">
        {step === 0 && (
          <Step
            badge="Passo 1 de 4"
            title="O que você lê?"
            subtitle="Escolha um ou mais formatos. Vamos personalizar tudo — busca, feed e recomendações — só com o que te interessa."
          >
            <div className="grid grid-cols-2 gap-3 mt-8">
              {CONTENT_TYPES.map((t) => {
                const active = contentTypes.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleContentType(t)}
                    aria-pressed={active}
                    className={cn(
                      "relative p-5 rounded-2xl border text-left transition-all",
                      active
                        ? "bg-primary/10 border-primary scale-[1.02] shadow-glow"
                        : "bg-card/50 border-border hover:border-primary/40",
                    )}
                  >
                    <div className="text-3xl mb-2" aria-hidden>{CONTENT_TYPE_ICON[t]}</div>
                    <p className="font-display font-semibold text-base">{CONTENT_TYPE_LABEL[t]}</p>
                    {active && (
                      <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <Footer
              countLabel={`${contentTypes.length} ${contentTypes.length === 1 ? "formato" : "formatos"}`}
              canNext={contentTypes.length >= 1}
              onNext={() => setStep(1)}
            />
          </Step>
        )}

        {step === 1 && (
          <Step
            badge="Passo 2 de 4"
            title="Quais gêneros você curte?"
            subtitle="Escolha pelo menos 3 para personalizar suas recomendações."
          >
            <div className="flex flex-wrap gap-2 mt-6">
              {GENRES.map((g) => {
                const active = genres.includes(g);
                return (
                  <button
                    key={g}
                    onClick={() => toggleGenre(g)}
                    className={cn(
                      "px-4 py-2.5 rounded-full text-sm font-medium border transition-all",
                      active
                        ? "bg-primary text-primary-foreground border-primary scale-[1.02]"
                        : "bg-card/50 border-border hover:border-primary/50 hover:bg-card",
                    )}
                  >
                    {active && <Check className="w-3 h-3 inline mr-1.5 -mt-0.5" />}
                    {g}
                  </button>
                );
              })}
            </div>
            <Footer
              countLabel={`${genres.length} ${genres.length === 1 ? "gênero" : "gêneros"}`}
              canNext={genres.length >= 3}
              onBack={() => setStep(0)}
              onNext={goNextFromGenres}
            />
          </Step>
        )}

        {step === 2 && contentTypes.includes("book") && (
          <Step
            badge="Passo 3 de 4"
            title="Quais livros você quer ler?"
            subtitle="Adicione alguns títulos à sua lista de desejos. Você pode pular este passo."
          >
            <div className="mt-6 relative">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar título ou autor…"
                className="h-12 pl-4 text-base"
                autoFocus
              />
            </div>

            {picks.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Selecionados ({picks.length})
                </p>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                  {picks.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => togglePick(b)}
                      className="relative flex-none group"
                      aria-label="Remover"
                    >
                      <BookCover book={b} size="sm" />
                      <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 rounded-md flex items-center justify-center transition-opacity">
                        <span className="text-xs font-medium">Remover</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex-1 min-h-0">
              {searching ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : results.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                  {results.map((b) => {
                    const selected = !!picks.find((p) => p.id === b.id);
                    return (
                      <button
                        key={b.id}
                        onClick={() => togglePick(b)}
                        className={cn(
                          "relative text-left group transition-all",
                          selected && "ring-2 ring-primary rounded-md ring-offset-2 ring-offset-background",
                        )}
                      >
                        <BookCover book={b} size="sm" className="!w-full !h-32 sm:!h-40" />
                        {selected && (
                          <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-glow">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <p className="text-xs font-semibold mt-1.5 line-clamp-2 leading-tight">{b.title}</p>
                      </button>
                    );
                  })}
                </div>
              ) : search.length >= 2 ? (
                <p className="text-center text-sm text-muted-foreground py-10">Nenhum resultado.</p>
              ) : (
                <div className="text-center text-sm text-muted-foreground py-10 flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Comece digitando para encontrar livros
                </div>
              )}
            </div>

            <Footer
              countLabel={`${picks.length} ${picks.length === 1 ? "livro" : "livros"}`}
              canNext={true}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          </Step>
        )}

        {step === 3 && (
          <Step
            badge="Passo 4 de 4"
            title="Qual sua meta para o ano?"
            subtitle="Defina quantos itens você quer ler. Pode ajustar a qualquer momento."
          >
            <div className="mt-10 flex flex-col items-center justify-center flex-1">
              <div className="w-32 h-32 rounded-full bg-gradient-gold flex items-center justify-center shadow-glow mb-6">
                <Target className="w-14 h-14 text-primary-foreground" />
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setGoal(Math.max(1, goal - 1))}
                  className="w-12 h-12 rounded-full border border-border hover:border-primary/50 text-2xl font-light hover:bg-card transition-all"
                >
                  −
                </button>
                <div className="text-center min-w-[140px]">
                  <p className="font-display text-7xl font-bold tabular-nums text-gradient-gold leading-none">
                    {goal}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">em {new Date().getFullYear()}</p>
                </div>
                <button
                  onClick={() => setGoal(Math.min(365, goal + 1))}
                  className="w-12 h-12 rounded-full border border-border hover:border-primary/50 text-2xl font-light hover:bg-card transition-all"
                >
                  +
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mt-8 justify-center">
                {[6, 12, 24, 50].map((n) => (
                  <button
                    key={n}
                    onClick={() => setGoal(n)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium border transition-all",
                      goal === n
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card/50 border-border hover:border-primary/50",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <Footer
              canNext={true}
              onBack={goBackFromGoal}
              onNext={finish}
              nextLabel={saving ? "Finalizando…" : "Começar a ler"}
              nextLoading={saving}
              isLast
            />
          </Step>
        )}
      </main>
    </div>
  );
}

function Step({ badge, title, subtitle, children }: {
  badge: string; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col animate-fade-in">
      <span className="text-xs font-bold text-primary uppercase tracking-widest mb-2">{badge}</span>
      <h1 className="font-display text-3xl md:text-4xl font-bold leading-tight">{title}</h1>
      <p className="text-muted-foreground mt-2">{subtitle}</p>
      {children}
    </div>
  );
}

function Footer({ countLabel, canNext, onBack, onNext, nextLabel = "Continuar", nextLoading, isLast }: {
  countLabel?: string; canNext: boolean;
  onBack?: () => void; onNext: () => void;
  nextLabel?: string; nextLoading?: boolean; isLast?: boolean;
}) {
  return (
    <div className="mt-8 pt-6 border-t border-border/40 flex items-center justify-between gap-3">
      {onBack ? (
        <Button variant="ghost" onClick={onBack}>Voltar</Button>
      ) : <div />}
      <div className="flex items-center gap-3">
        {countLabel && (
          <span className="text-xs text-muted-foreground hidden sm:inline">{countLabel}</span>
        )}
        <Button
          variant="hero"
          size="lg"
          onClick={onNext}
          disabled={!canNext || nextLoading}
          className="gap-2 min-w-[140px]"
        >
          {nextLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
            <>
              {nextLabel}
              {!isLast && <ArrowRight className="w-4 h-4" />}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
