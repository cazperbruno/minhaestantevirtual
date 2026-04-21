import { useMemo, useState } from "react";
import { Loader2, Trash2, Check, AlertTriangle, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { BookStatus } from "@/types/book";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { invalidate } from "@/lib/query-client";
import { awardXp } from "@/lib/xp";
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
  errorMessage?: string;
}

const STATUS_OPTIONS: Array<{ value: BookStatus; label: string; hint: string }> = [
  { value: "not_read", label: "Acervo", hint: "Tenho mas ainda não li" },
  { value: "wishlist", label: "Quero ler", hint: "Lista de desejos" },
  { value: "reading",  label: "Lendo",     hint: "Em andamento" },
  { value: "read",     label: "Lido",      hint: "Já concluído" },
];

interface Props {
  items: BatchItem[];
  /** Atualiza o status escolhido para um item específico. */
  onUpdateStatus: (key: string, status: BookStatus) => void;
  /** Remove um item da lista. */
  onRemove: (key: string) => void;
  /** Limpa toda a lista (após salvar ou descarte). */
  onClear: () => void;
  /** Marca itens como `saved` no estado pai conforme cada upsert resolve. */
  onMarkSaved: (keys: string[]) => void;
}

/**
 * Lista visual do lote de scan. Substitui a UI antiga de "histórico da sessão"
 * por cards completos com seleção de status e ação em massa.
 *
 * Fluxo:
 *  1. Scanner detecta ISBN → pai cria item `loading`
 *  2. Lookup resolve → pai muda para `ready` (ou `error`)
 *  3. Usuário ajusta status por item (default: "Acervo")
 *  4. "Adicionar todos" → upsert paralelo, toast de sucesso, invalida cache
 */
export function BatchScanList({
  items, onUpdateStatus, onRemove, onClear, onMarkSaved,
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

    // Upsert em paralelo, mas com pequeno limite implícito (Promise.all aguenta dezenas)
    await Promise.all(
      toSave.map(async (item) => {
        try {
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

      {/* Lista de items — scroll vertical contido se passar de ~5 itens */}
      <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/40">
        {items.map((item) => (
          <BatchItemRow
            key={item.key}
            item={item}
            disabled={submitting}
            onUpdateStatus={(s) => onUpdateStatus(item.key, s)}
            onRemove={() => onRemove(item.key)}
          />
        ))}
      </div>
    </div>
  );
}

function BatchItemRow({
  item, disabled, onUpdateStatus, onRemove,
}: {
  item: BatchItem;
  disabled: boolean;
  onUpdateStatus: (s: BookStatus) => void;
  onRemove: () => void;
}) {
  const isError = item.status === "error";
  const isSaved = item.status === "saved";
  const isLoading = item.status === "loading";
  const isSaving = item.status === "saving";

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 transition-colors",
      isSaved && "bg-status-read/5",
      isError && "bg-destructive/5",
    )}>
      {/* Capa */}
      <div className={cn(
        "w-12 h-16 shrink-0 rounded-md overflow-hidden bg-muted ring-1 ring-border relative",
        isSaved && "ring-status-read/40",
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
          </>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-1.5 shrink-0">
        {(item.status === "ready" || isSaving) && !isSaved && (
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
        )}

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
    </div>
  );
}
