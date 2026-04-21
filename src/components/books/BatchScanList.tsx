import { useMemo, useState } from "react";
import { Loader2, Trash2, Check, AlertTriangle, BookOpen, Sparkles, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { BookStatus, ContentType } from "@/types/book";
import { CONTENT_TYPE_LABEL } from "@/types/book";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { invalidate } from "@/lib/query-client";
import { awardXp } from "@/lib/xp";
import { strFold } from "@/lib/series-normalize";
import { toast } from "sonner";

/**
 * Item de um lote de escaneamento.
 *  - `loading`: ISBN detectado, ainda buscando metadados
 *  - `ready`:   livro localizado, pronto para entrar na biblioteca
 *  - `error`:   ISBN não foi encontrado em nenhum catálogo
 *  - `saving`:  upsert em andamento (durante "Adicionar todos")
 *  - `saved`:   já persistido no acervo do usuário
 */
export type BatchItemStatus = "loading" | "ready" | "error" | "saving" | "saved";

export interface BatchItem {
  /** Chave estável (uuid v4) — não é o id do livro. */
  key: string;
  isbn: string;
  status: BatchItemStatus;
  bookId?: string;
  title?: string;
  authors?: string[];
  cover_url?: string | null;
  /** Status que será atribuído ao adicionar à biblioteca. */
  pickedStatus: BookStatus;
  /** Tipo de conteúdo atual no banco (vem do lookup). */
  content_type?: ContentType;
  /** Override manual do usuário (override do `content_type` antes do upsert). */
  pickedContentType?: ContentType;
  errorMessage?: string;
}

const STATUS_OPTIONS: Array<{ value: BookStatus; label: string; hint: string }> = [
  { value: "not_read", label: "Acervo", hint: "Tenho mas ainda não li" },
  { value: "wishlist", label: "Quero ler", hint: "Lista de desejos" },
  { value: "reading",  label: "Lendo",     hint: "Em andamento" },
  { value: "read",     label: "Lido",      hint: "Já concluído" },
];

const CONTENT_TYPE_OPTIONS: ContentType[] = ["book", "manga", "comic", "magazine"];

interface Props {
  items: BatchItem[];
  /** Atualiza o status escolhido para um item específico. */
  onUpdateStatus: (key: string, status: BookStatus) => void;
  /** Atualiza o content_type escolhido para um item específico. */
  onUpdateContentType: (key: string, ct: ContentType) => void;
  /** Remove um item da lista. */
  onRemove: (key: string) => void;
  /** Limpa toda a lista (após salvar ou descarte). */
  onClear: () => void;
  /** Marca itens como `saved` no estado pai conforme cada upsert resolve. */
  onMarkSaved: (keys: string[]) => void;
}

/**
 * Lista visual do lote de scan.
 *
 * Detecção de "provável série não-numerada":
 * Quando 2+ itens do lote compartilham o MESMO título normalizado +
 * MESMO primeiro autor, exibe alerta no header e destaca esses itens
 * em vermelho-âmbar pedindo confirmação do `content_type` (book vs manga
 * vs comic). Isso resolve o caso "Chainsaw Man" — múltiplas cópias com
 * título idêntico que na verdade são volumes distintos. Ao salvar com
 * `pickedContentType` definido, atualizamos `books.content_type` antes
 * do upsert, permitindo que o detector de séries reconheça o agrupamento.
 */
export function BatchScanList({
  items, onUpdateStatus, onUpdateContentType, onRemove, onClear, onMarkSaved,
}: Props) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const counts = useMemo(() => ({
    total:   items.length,
    loading: items.filter((i) => i.status === "loading").length,
    ready:   items.filter((i) => i.status === "ready").length,
    error:   items.filter((i) => i.status === "error").length,
    saved:   items.filter((i) => i.status === "saved").length,
  }), [items]);

  /**
   * Mapa keyDoGrupo → quantidade. Um grupo é definido como
   * (titulo normalizado + primeiro autor normalizado).
   * Itens com count >= 2 são "potencial série".
   */
  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      if (it.status !== "ready" && it.status !== "saving") continue;
      if (!it.title) continue;
      const titleKey = strFold(it.title);
      const authorKey = strFold(it.authors?.[0] || "");
      const k = `${titleKey}|${authorKey}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [items]);

  const groupKeyOf = (it: BatchItem) =>
    `${strFold(it.title || "")}|${strFold(it.authors?.[0] || "")}`;

  // Itens em colisão (mesmo título+autor que outro item ready)
  const colidingKeys = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (!it.title) continue;
      if (groupCounts.get(groupKeyOf(it)) ?? 0 >= 2) {
        if ((groupCounts.get(groupKeyOf(it)) ?? 0) >= 2) set.add(it.key);
      }
    }
    return set;
  }, [items, groupCounts]);

  /**
   * Grupos não resolvidos: ≥2 itens compartilhando título+autor onde NENHUM
   * tem `pickedContentType` definido (override) e o `content_type` original
   * é `book`. Esses são os candidatos a "provavelmente mangá/HQ".
   */
  const unresolvedGroups = useMemo(() => {
    const groups = new Map<string, BatchItem[]>();
    for (const it of items) {
      if (it.status !== "ready" || !it.title) continue;
      const k = groupKeyOf(it);
      if ((groupCounts.get(k) ?? 0) < 2) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(it);
    }
    // só "não resolvido" se TODOS os itens do grupo ainda estão como `book` puro
    // sem override do usuário
    const out: BatchItem[][] = [];
    for (const arr of groups.values()) {
      const allDefaultBook = arr.every((it) =>
        !it.pickedContentType && (it.content_type ?? "book") === "book"
      );
      if (allDefaultBook) out.push(arr);
    }
    return out;
  }, [items, groupCounts]);

  const canSubmit = !submitting && counts.ready > 0;

  const addAll = async () => {
    if (!user) {
      toast.error("Faça login para adicionar livros");
      return;
    }
    const toSave = items.filter((i) => i.status === "ready" && i.bookId);
    if (toSave.length === 0) return;

    setSubmitting(true);
    const savedKeys: string[] = [];
    let okCount = 0;
    let typeChanges = 0;

    // Upsert em paralelo, mas com pequeno limite implícito (Promise.all aguenta dezenas)
    await Promise.all(
      toSave.map(async (item) => {
        try {
          // Se o usuário trocou o content_type, atualiza o book antes
          // (necessário para que o detector de séries agrupe corretamente).
          const wantsTypeChange =
            item.pickedContentType &&
            item.pickedContentType !== (item.content_type ?? "book");
          if (wantsTypeChange) {
            const { error: ctErr } = await supabase
              .from("books")
              .update({ content_type: item.pickedContentType! })
              .eq("id", item.bookId!);
            if (ctErr) {
              // não bloqueia o save — apenas registra
              console.warn("update content_type failed", item.isbn, ctErr);
            } else {
              typeChanges++;
            }
          }

          const { error } = await supabase
            .from("user_books")
            .upsert(
              { user_id: user.id, book_id: item.bookId!, status: item.pickedStatus },
              { onConflict: "user_id,book_id" },
            );
          if (error) throw error;
          savedKeys.push(item.key);
          okCount++;
          // XP silencioso: 1 por livro adicionado
          void awardXp(user.id, "add_book", { silent: true });
        } catch (e) {
          // Mantém o item como "ready" pra usuário tentar de novo
          console.error("batch add failed", item.isbn, e);
        }
      }),
    );

    onMarkSaved(savedKeys);
    invalidate.library(user.id);
    setSubmitting(false);

    if (okCount > 0) {
      toast.success(
        okCount === 1
          ? "1 livro adicionado à biblioteca"
          : `${okCount} livros adicionados à biblioteca`,
      );
    }
    if (typeChanges > 0) {
      toast.info(
        typeChanges === 1
          ? "1 livro reclassificado — série será agrupada em segundos"
          : `${typeChanges} livros reclassificados — séries serão agrupadas em segundos`,
        { duration: 3500 },
      );
    }
    if (okCount < toSave.length) {
      toast.error(`${toSave.length - okCount} livros falharam — tente novamente`);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="glass rounded-2xl border border-primary/30 shadow-glow animate-fade-in overflow-hidden">
      {/* Header com contadores e ação principal */}
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border/60">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-primary font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Lote de escaneamento
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="text-foreground font-semibold tabular-nums">{counts.total}</span>{" "}
            {counts.total === 1 ? "livro" : "livros"}
            {counts.loading > 0 && <> · {counts.loading} carregando</>}
            {counts.error > 0 && <> · {counts.error} com erro</>}
            {counts.saved > 0 && <> · {counts.saved} salvos</>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClear} disabled={submitting} className="h-9">
            Limpar
          </Button>
          <Button
            variant="hero"
            size="sm"
            onClick={addAll}
            disabled={!canSubmit}
            className="h-9 gap-1.5"
          >
            {submitting ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adicionando…</>
            ) : (
              <><Check className="w-3.5 h-3.5" /> Adicionar {counts.ready > 0 ? counts.ready : "todos"}</>
            )}
          </Button>
        </div>
      </div>

      {/* Aviso de provável série não-numerada */}
      {unresolvedGroups.length > 0 && (
        <div className="px-4 pt-4">
          <Alert className="border-amber-500/40 bg-amber-500/5">
            <Layers className="h-4 w-4 text-amber-500" aria-hidden />
            <AlertTitle className="text-sm">Provável série detectada</AlertTitle>
            <AlertDescription className="text-xs">
              {unresolvedGroups.length === 1
                ? "Encontramos várias cópias com o mesmo título e autor — provavelmente são volumes da mesma série."
                : `Encontramos ${unresolvedGroups.length} grupos de cópias com mesmo título — provavelmente são séries.`}{" "}
              Confirme o tipo (mangá / quadrinho) abaixo para que eles sejam agrupados automaticamente.
              <div className="mt-2 flex flex-wrap gap-2">
                {unresolvedGroups.map((grp, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      // marca todos como manga (sugestão default mais comum)
                      grp.forEach((it) => onUpdateContentType(it.key, "manga"));
                    }}
                    className="text-xs px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-colors"
                  >
                    Marcar “{grp[0].title}” ({grp.length}×) como mangá
                  </button>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Lista de items — scroll vertical contido se passar de ~5 itens */}
      <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/40">
        {items.map((item) => (
          <BatchItemRow
            key={item.key}
            item={item}
            disabled={submitting}
            isColliding={colidingKeys.has(item.key)}
            onUpdateStatus={(s) => onUpdateStatus(item.key, s)}
            onUpdateContentType={(ct) => onUpdateContentType(item.key, ct)}
            onRemove={() => onRemove(item.key)}
          />
        ))}
      </div>
    </div>
  );
}

function BatchItemRow({
  item, disabled, isColliding, onUpdateStatus, onUpdateContentType, onRemove,
}: {
  item: BatchItem;
  disabled: boolean;
  isColliding: boolean;
  onUpdateStatus: (s: BookStatus) => void;
  onUpdateContentType: (ct: ContentType) => void;
  onRemove: () => void;
}) {
  const isError = item.status === "error";
  const isSaved = item.status === "saved";
  const isLoading = item.status === "loading";
  const isSaving = item.status === "saving";
  const effectiveType: ContentType =
    item.pickedContentType ?? item.content_type ?? "book";
  // Mostrar destaque só quando colide E ainda está como "book" puro
  const needsAttention =
    isColliding &&
    !item.pickedContentType &&
    (item.content_type ?? "book") === "book";

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 transition-colors",
      isSaved && "bg-status-read/5",
      isError && "bg-destructive/5",
      needsAttention && !isSaved && !isError && "bg-amber-500/5",
    )}>
      {/* Capa */}
      <div className={cn(
        "w-12 h-16 shrink-0 rounded-md overflow-hidden bg-muted ring-1 ring-border relative",
        isSaved && "ring-status-read/40",
        needsAttention && "ring-amber-500/50",
      )}>
        {item.cover_url ? (
          <img src={item.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
          </div>
        )}
        {isSaved && (
          <div className="absolute inset-0 bg-status-read/30 flex items-center justify-center backdrop-blur-[1px]">
            <Check className="w-5 h-5 text-status-read drop-shadow" />
          </div>
        )}
      </div>

      {/* Infos */}
      <div className="flex-1 min-w-0">
        {isLoading ? (
          <>
            <p className="text-sm text-muted-foreground">Buscando…</p>
            <p className="text-xs font-mono text-muted-foreground/70 mt-0.5">ISBN {item.isbn}</p>
          </>
        ) : isError ? (
          <>
            <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Não encontrado
            </p>
            <p className="text-xs font-mono text-muted-foreground/80 mt-0.5">ISBN {item.isbn}</p>
          </>
        ) : (
          <>
            <h4 className="font-display font-semibold text-sm leading-tight line-clamp-2">
              {item.title}
            </h4>
            {item.authors?.[0] && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {item.authors[0]}
              </p>
            )}
            {needsAttention && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Confirme o tipo para agrupar como série
              </p>
            )}
          </>
        )}
      </div>

      {/* Ações */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {(item.status === "ready" || isSaving) && !isSaved && (
          <div className="flex items-center gap-1.5">
            {/* Tipo de conteúdo — sempre mostra quando colide; senão escondido */}
            {isColliding && (
              <Select
                value={effectiveType}
                onValueChange={(v) => onUpdateContentType(v as ContentType)}
                disabled={disabled || isSaving}
              >
                <SelectTrigger
                  className={cn(
                    "h-8 w-[100px] text-xs",
                    needsAttention && "border-amber-500/50",
                  )}
                  aria-label="Tipo de conteúdo"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPE_OPTIONS.map((ct) => (
                    <SelectItem key={ct} value={ct} className="text-xs">
                      {CONTENT_TYPE_LABEL[ct]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select
              value={item.pickedStatus}
              onValueChange={(v) => onUpdateStatus(v as BookStatus)}
              disabled={disabled || isSaving}
            >
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-muted-foreground ml-1.5 text-[10px]">{opt.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isSaving && <Loader2 className="w-4 h-4 animate-spin text-primary" />}

            {!isSaving && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRemove}
                disabled={disabled}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label="Remover do lote"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
