/**
 * /series/gerenciar — Gerenciamento manual de séries.
 *
 * Para quando o detector automático falha (livros sem autor, mangás
 * categorizados como `book`, títulos atípicos, etc.). Permite:
 *  - Criar série nova manualmente
 *  - Editar série existente (título, autor, content_type, total, capa)
 *  - Excluir série (desvincula livros automaticamente)
 *  - Vincular livros da minha biblioteca a uma série, definindo o volume
 *  - Remover volumes de uma série
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { SeriesValidationPanel } from "@/components/series/SeriesValidationPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BookOpen, Layers, Pencil, Plus, Settings, Trash2, Link2, Unlink, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CONTENT_TYPE_LABEL, type ContentType } from "@/types/book";
import {
  useManageableSeries,
  useUnlinkedUserBooks,
  useCreateSeries,
  useUpdateSeries,
  useDeleteSeries,
  useLinkBookToSeries,
  useUnlinkBookFromSeries,
  useUpdateVolumeNumber,
  type ManageableSeries,
  type SeriesInput,
  type UnlinkedUserBook,
} from "@/hooks/useManageSeries";
import { useSeriesDetail } from "@/hooks/useSeries";
import { useEnrichSeries } from "@/hooks/useEnrichSeries";
import { cn } from "@/lib/utils";

const CONTENT_TYPES: ContentType[] = ["manga", "comic", "book", "magazine"];
const STATUS_OPTIONS = [
  { value: "ongoing", label: "Em curso" },
  { value: "finished", label: "Finalizada" },
  { value: "hiatus", label: "Em hiato" },
  { value: "cancelled", label: "Cancelada" },
  { value: "upcoming", label: "Em breve" },
];

export default function ManageSeriesPage() {
  const { data: series, isLoading } = useManageableSeries();
  const [editing, setEditing] = useState<ManageableSeries | null>(null);
  const [linkingTo, setLinkingTo] = useState<ManageableSeries | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 md:pt-12 pb-20 max-w-5xl mx-auto">
        <header className="mb-6 flex items-start justify-between gap-3 animate-fade-in">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold flex items-center gap-3">
              <Settings className="w-7 h-7 text-primary" /> Gerenciar séries
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm md:text-base">
              Crie, edite e organize manualmente quando o detector automático não acerta.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <BulkEnrichButton series={series ?? []} />
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Nova série
            </Button>
          </div>
        </header>

        <div className="mb-6">
          <Link
            to="/series"
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            ← Voltar para minhas séries
          </Link>
        </div>

        <div className="mb-6">
          <SeriesValidationPanel />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : !series || series.length === 0 ? (
          <EmptyState
            icon={<Layers />}
            title="Nenhuma série ainda"
            description="Crie sua primeira série manualmente, ou adicione mangás à biblioteca para detecção automática."
            action={
              <Button onClick={() => setCreating(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Criar série
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {series.map((s) => (
              <SeriesRow
                key={s.id}
                s={s}
                onEdit={() => setEditing(s)}
                onLink={() => setLinkingTo(s)}
              />
            ))}
          </ul>
        )}

        {/* Criar / editar série */}
        <SeriesFormDialog
          open={creating}
          onOpenChange={setCreating}
          mode="create"
        />
        <SeriesFormDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          mode="edit"
          series={editing ?? undefined}
        />

        {/* Vincular livros */}
        <LinkBooksDialog
          open={!!linkingTo}
          onOpenChange={(o) => !o && setLinkingTo(null)}
          series={linkingTo}
        />
      </div>
    </AppShell>
  );
}

// ---------------- linha de cada série ----------------
function SeriesRow({
  s,
  onEdit,
  onLink,
}: {
  s: ManageableSeries;
  onEdit: () => void;
  onLink: () => void;
}) {
  const del = useDeleteSeries();
  const enrich = useEnrichSeries();
  const enriching = enrich.isPending && enrich.variables?.seriesId === s.id;
  const total = s.total_volumes ?? s.user_volume_count;
  const pct = total > 0 ? Math.min(100, Math.round((s.user_volume_count / total) * 100)) : 0;
  const totalUnknown = s.total_volumes == null;

  return (
    <li className="glass rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-start">
      <div className="w-14 h-20 shrink-0 rounded-md overflow-hidden bg-muted">
        {s.cover_url ? (
          <img src={s.cover_url} alt={s.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full grid place-items-center text-muted-foreground">
            <BookOpen className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Badge variant="outline" className="text-[10px]">
            {CONTENT_TYPE_LABEL[s.content_type]}
          </Badge>
          {s.source && (
            <Badge variant="outline" className="text-[10px] opacity-70">
              {s.source === "manual" ? "manual" : "auto"}
            </Badge>
          )}
        </div>
        <h3 className="font-display font-semibold leading-tight line-clamp-1">{s.title}</h3>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {s.authors[0] || "sem autor"}
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs tabular-nums">
          <span className="text-muted-foreground">
            {s.user_volume_count} / {s.total_volumes ?? "?"} volumes
          </span>
          {total > 0 && (
            <span className="text-primary font-semibold">{pct}%</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
        <Link to={`/serie/${s.id}`}>
          <Button size="sm" variant="ghost" className="gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Ver
          </Button>
        </Link>
        <Button
          size="sm"
          variant={totalUnknown ? "outline" : "ghost"}
          onClick={() => enrich.mutate({ seriesId: s.id, force: true })}
          disabled={enriching}
          className={cn(
            "gap-1.5",
            totalUnknown && "border-primary/40 text-primary hover:bg-primary/10",
          )}
          title="Buscar metadados oficiais (volumes, status, sinopse) com IA + AniList"
        >
          {enriching ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          IA
        </Button>
        <Button size="sm" variant="ghost" onClick={onLink} className="gap-1.5">
          <Link2 className="w-3.5 h-3.5" /> Volumes
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit} className="gap-1.5">
          <Pencil className="w-3.5 h-3.5" /> Editar
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="gap-1.5 text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir esta série?</AlertDialogTitle>
              <AlertDialogDescription>
                Os {s.user_volume_count} volume(s) voltam para sua biblioteca como livros
                avulsos. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => del.mutate(s.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

// ---------------- form criar/editar ----------------
function SeriesFormDialog({
  open,
  onOpenChange,
  mode,
  series,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "create" | "edit";
  series?: ManageableSeries;
}) {
  const create = useCreateSeries();
  const update = useUpdateSeries();
  const [title, setTitle] = useState(series?.title ?? "");
  const [authors, setAuthors] = useState((series?.authors || []).join(", "));
  const [contentType, setContentType] = useState<ContentType>(series?.content_type ?? "manga");
  const [totalVolumes, setTotalVolumes] = useState<string>(
    series?.total_volumes ? String(series.total_volumes) : "",
  );
  const [coverUrl, setCoverUrl] = useState(series?.cover_url ?? "");
  const [status, setStatus] = useState<string>(series?.status ?? "ongoing");
  const [description, setDescription] = useState(series?.description ?? "");

  // Re-inicializa quando troca a série editada
  useState(() => {
    if (mode === "edit" && series) {
      setTitle(series.title);
      setAuthors((series.authors || []).join(", "));
      setContentType(series.content_type);
      setTotalVolumes(series.total_volumes ? String(series.total_volumes) : "");
      setCoverUrl(series.cover_url ?? "");
      setStatus(series.status ?? "ongoing");
      setDescription(series.description ?? "");
    }
  });

  const submit = async () => {
    const input: SeriesInput = {
      title,
      authors: authors.split(",").map((a) => a.trim()).filter(Boolean),
      content_type: contentType,
      total_volumes: totalVolumes ? parseInt(totalVolumes, 10) : null,
      cover_url: coverUrl || null,
      status: status || null,
      description: description || null,
    };
    if (!input.title.trim()) return;
    if (mode === "create") {
      await create.mutateAsync(input);
    } else if (series) {
      await update.mutateAsync({ id: series.id, input });
    }
    onOpenChange(false);
  };

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nova série" : "Editar série"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Chainsaw Man" />
          </div>
          <div>
            <Label>Autor(es)</Label>
            <Input
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder="Separados por vírgula"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{CONTENT_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Total de volumes</Label>
              <Input
                type="number"
                min="1"
                value={totalVolumes}
                onChange={(e) => setTotalVolumes(e.target.value)}
                placeholder="ex.: 11"
              />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>URL da capa</Label>
            <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Sinopse curta (opcional)"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || !title.trim()}>
            {busy ? "Salvando..." : mode === "create" ? "Criar" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- vincular livros à série ----------------
function LinkBooksDialog({
  open,
  onOpenChange,
  series,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  series: ManageableSeries | null;
}) {
  const { data: detail } = useSeriesDetail(series?.id);
  const { data: allBooks } = useUnlinkedUserBooks();
  const link = useLinkBookToSeries();
  const unlink = useUnlinkBookFromSeries();
  const updateVol = useUpdateVolumeNumber();
  const [search, setSearch] = useState("");

  const linkedVolumes = useMemo(() => detail?.volumes ?? [], [detail]);

  const candidates = useMemo<UnlinkedUserBook[]>(() => {
    if (!allBooks || !series) return [];
    const q = search.trim().toLowerCase();
    return allBooks
      .filter((b) => b.current_series_id !== series.id)
      .filter((b) => (q ? b.title.toLowerCase().includes(q) : true))
      .slice(0, 50);
  }, [allBooks, series, search]);

  if (!series) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Volumes de "{series.title}"
          </DialogTitle>
        </DialogHeader>

        {/* Volumes já vinculados */}
        <section className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Vinculados ({linkedVolumes.length})
          </h3>
          {linkedVolumes.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhum volume ainda.</p>
          ) : (
            <ul className="space-y-1.5">
              {linkedVolumes.map((v) => (
                <LinkedVolumeRow
                  key={v.id}
                  bookId={v.id}
                  title={v.title}
                  coverUrl={v.cover_url ?? null}
                  currentVolume={v.volume_number ?? null}
                  usedNumbers={
                    new Map(
                      linkedVolumes
                        .filter((x) => typeof x.volume_number === "number")
                        .map((x) => [x.volume_number as number, x.id]),
                    )
                  }
                  onSave={(val) => updateVol.mutate({ bookId: v.id, volumeNumber: val })}
                  onUnlink={() => unlink.mutate(v.id)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Adicionar livros da biblioteca */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Adicionar livros da minha biblioteca
          </h3>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pelo título..."
            className="mb-2"
          />
          <ul className="space-y-1.5 max-h-72 overflow-y-auto">
            {candidates.length === 0 ? (
              <li className="text-xs text-muted-foreground italic px-2 py-2">
                Nenhum livro encontrado.
              </li>
            ) : (
              candidates.map((b) => (
                <CandidateRow
                  key={b.book_id}
                  book={b}
                  usedNumbers={
                    new Map(
                      linkedVolumes
                        .filter((x) => typeof x.volume_number === "number")
                        .map((x) => [x.volume_number as number, x.title]),
                    )
                  }
                  onAdd={(vol) =>
                    link.mutate({ bookId: b.book_id, seriesId: series.id, volumeNumber: vol })
                  }
                />
              ))
            )}
          </ul>
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- linha de volume já vinculado (com validação inline) ----------------
function LinkedVolumeRow({
  bookId,
  title,
  coverUrl,
  currentVolume,
  usedNumbers,
  onSave,
  onUnlink,
}: {
  bookId: string;
  title: string;
  coverUrl: string | null;
  currentVolume: number | null;
  /** map volumeNumber → bookId que já o usa (na MESMA série) */
  usedNumbers: Map<number, string>;
  onSave: (val: number | null) => void;
  onUnlink: () => void;
}) {
  const [val, setVal] = useState<string>(currentVolume != null ? String(currentVolume) : "");
  const parsed = val ? parseInt(val, 10) : null;
  // Conflito = número já está em uso por OUTRO livro da mesma série
  const conflictOwnerId =
    parsed != null && !Number.isNaN(parsed) ? usedNumbers.get(parsed) : undefined;
  const hasConflict = !!conflictOwnerId && conflictOwnerId !== bookId;
  const isUnnumbered = currentVolume == null && !val;

  const commit = () => {
    if (hasConflict) {
      toast.error(`Volume #${parsed} já está em uso nesta série`, {
        description: "Escolha outro número ou remova o conflito antes de salvar.",
      });
      // restaura visual
      setVal(currentVolume != null ? String(currentVolume) : "");
      return;
    }
    if (parsed !== currentVolume) {
      onSave(parsed && !Number.isNaN(parsed) ? parsed : null);
    }
  };

  return (
    <li
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors",
        hasConflict
          ? "bg-destructive/10 ring-1 ring-destructive/40"
          : isUnnumbered
            ? "bg-amber-500/5 ring-1 ring-amber-500/30"
            : "hover:bg-muted/40",
      )}
    >
      <div className="w-7 h-10 shrink-0 rounded bg-muted overflow-hidden">
        {coverUrl && <img src={coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm line-clamp-1">{title}</p>
        {hasConflict && (
          <p className="text-[10px] text-destructive flex items-center gap-1 mt-0.5">
            <AlertTriangle className="w-3 h-3" />
            Já existe volume #{parsed} nesta série
          </p>
        )}
        {!hasConflict && isUnnumbered && (
          <p className="text-[10px] text-amber-500 flex items-center gap-1 mt-0.5">
            <AlertTriangle className="w-3 h-3" /> Volume sem número
          </p>
        )}
      </div>
      <Input
        type="number"
        min="1"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          "w-16 h-8 text-xs",
          hasConflict && "border-destructive focus-visible:ring-destructive",
        )}
        placeholder="vol"
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={onUnlink}
        className="h-8 w-8 p-0 text-destructive"
        title="Remover da série"
      >
        <Unlink className="w-3.5 h-3.5" />
      </Button>
    </li>
  );
}

function CandidateRow({
  book,
  usedNumbers,
  onAdd,
}: {
  book: UnlinkedUserBook;
  /** map volumeNumber → título do livro que já o usa nesta série */
  usedNumbers: Map<number, string>;
  onAdd: (vol: number | null) => void;
}) {
  const [vol, setVol] = useState<string>(book.volume_number ? String(book.volume_number) : "");
  const parsed = vol ? parseInt(vol, 10) : null;
  const numberConflict =
    parsed != null && !Number.isNaN(parsed) ? usedNumbers.get(parsed) : undefined;
  const hasNumberConflict = !!numberConflict;
  // sobreposição entre séries: livro já pertence a OUTRA série
  const hasSeriesOverlap = !!book.current_series_id;

  const blocked = hasNumberConflict;

  const handleAdd = () => {
    if (hasNumberConflict) {
      toast.error(`Volume #${parsed} já existe nesta série`, {
        description: `Em uso por: ${numberConflict}. Escolha outro número.`,
      });
      return;
    }
    if (hasSeriesOverlap) {
      // Não bloqueia, mas pede confirmação explícita
      const ok = window.confirm(
        `"${book.title}" já está em "${book.current_series_title}". Mover para esta série?`,
      );
      if (!ok) return;
    }
    onAdd(parsed && !Number.isNaN(parsed) ? parsed : null);
  };

  return (
    <li
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors",
        hasNumberConflict
          ? "bg-destructive/10 ring-1 ring-destructive/40"
          : hasSeriesOverlap
            ? "bg-amber-500/5 ring-1 ring-amber-500/30"
            : "hover:bg-muted/40",
      )}
    >
      <div className="w-7 h-10 shrink-0 rounded bg-muted overflow-hidden">
        {book.cover_url && (
          <img src={book.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm line-clamp-1">{book.title}</p>
        {hasSeriesOverlap && !hasNumberConflict && (
          <p className="text-[10px] text-amber-500 flex items-center gap-1 mt-0.5">
            <AlertTriangle className="w-3 h-3" />
            Já vinculado a "{book.current_series_title}" — vai ser movido
          </p>
        )}
        {hasNumberConflict && (
          <p className="text-[10px] text-destructive flex items-center gap-1 mt-0.5">
            <AlertTriangle className="w-3 h-3" />
            Vol. #{parsed} já existe (em "{numberConflict}")
          </p>
        )}
        {!hasSeriesOverlap && !hasNumberConflict && book.current_series_title && (
          <p className="text-[10px] text-muted-foreground line-clamp-1">
            atualmente em: {book.current_series_title}
          </p>
        )}
      </div>
      <Input
        type="number"
        min="1"
        value={vol}
        onChange={(e) => setVol(e.target.value)}
        className={cn(
          "w-16 h-8 text-xs",
          hasNumberConflict && "border-destructive focus-visible:ring-destructive",
        )}
        placeholder="vol"
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={handleAdd}
        disabled={blocked}
        className={cn(
          "h-8 px-2 gap-1",
          blocked ? "text-muted-foreground" : "text-primary",
        )}
      >
        <Plus className="w-3.5 h-3.5" /> Add
      </Button>
    </li>
  );
}
