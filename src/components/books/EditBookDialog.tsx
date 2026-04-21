import { useState } from "react";
import { Book } from "@/types/book";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookCover } from "./BookCover";
import { Pencil, Trash2, Upload, Wand2, Loader2, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { resolveCover } from "@/lib/cover-fallback";
import { refreshBookData } from "@/lib/refresh-book";
import { useNavigate } from "react-router-dom";

interface Props {
  book: Book;
  onUpdated?: (book: Book) => void;
  trigger?: React.ReactNode;
}

export function EditBookDialog({ book, onUpdated, trigger }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchingCover, setSearchingCover] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    title: book.title,
    subtitle: book.subtitle ?? "",
    authors: (book.authors || []).join(", "),
    publisher: book.publisher ?? "",
    published_year: book.published_year ?? "",
    page_count: book.page_count ?? "",
    isbn_13: book.isbn_13 ?? "",
    isbn_10: book.isbn_10 ?? "",
    description: book.description ?? "",
    cover_url: book.cover_url ?? "",
    categories: (book.categories || []).join(", "),
  });

  const set = (k: keyof typeof form, v: string | number) =>
    setForm((p) => ({ ...p, [k]: v }));

  const uploadCover = async (file: File) => {
    if (!user) {
      toast.error("Entre para enviar capas");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${book.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("book-covers")
        .upload(path, file, { cacheControl: "3600", upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("book-covers").getPublicUrl(path);
      set("cover_url", data.publicUrl);
      toast.success("Capa enviada");
    } catch (e: any) {
      toast.error(e?.message || "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const findCover = async () => {
    setSearchingCover(true);
    try {
      const found = await resolveCover({
        cover_url: null,
        isbn_10: form.isbn_10 || null,
        isbn_13: form.isbn_13 || null,
        title: form.title,
        authors: form.authors.split(",").map((s) => s.trim()).filter(Boolean),
      });
      if (found) {
        set("cover_url", found);
        toast.success("Capa encontrada");
      } else {
        toast.error("Nenhuma capa encontrada — adicione um ISBN ou faça upload");
      }
    } finally {
      setSearchingCover(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    try {
      const result = await refreshBookData(book.id, form.cover_url || null);
      if (!result.ok) {
        toast.error("Não foi possível atualizar os dados");
        return;
      }
      const patch: any = result.patch || {};
      const filled = result.fields_filled || [];
      if (filled.length === 0 && !result.cover_updated) {
        toast.info("Os dados já estão completos e atualizados");
        return;
      }
      setForm((p) => ({
        ...p,
        title: patch.title ?? p.title,
        subtitle: patch.subtitle ?? p.subtitle,
        authors: patch.authors ? (patch.authors as string[]).join(", ") : p.authors,
        publisher: patch.publisher ?? p.publisher,
        published_year: patch.published_year ?? p.published_year,
        page_count: patch.page_count ?? p.page_count,
        description: patch.description ?? p.description,
        cover_url: patch.cover_url ?? p.cover_url,
        categories: patch.categories ? (patch.categories as string[]).join(", ") : p.categories,
      }));
      toast.success(
        filled.length > 0 ? `Atualizado: ${filled.join(", ")}` : "Capa atualizada",
      );
    } catch (e: any) {
      toast.error(e?.message || "Erro ao atualizar dados");
    } finally {
      setRefreshing(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      authors: form.authors.split(",").map((s) => s.trim()).filter(Boolean),
      publisher: form.publisher.trim() || null,
      published_year: form.published_year ? Number(form.published_year) : null,
      page_count: form.page_count ? Number(form.page_count) : null,
      isbn_13: form.isbn_13.trim() || null,
      isbn_10: form.isbn_10.trim() || null,
      description: form.description.trim() || null,
      cover_url: form.cover_url.trim() || null,
      categories: form.categories.split(",").map((s) => s.trim()).filter(Boolean),
    };
    const { data, error } = await supabase
      .from("books")
      .update(payload)
      .eq("id", book.id)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Livro atualizado");
    onUpdated?.(data as Book);
    setOpen(false);
  };

  const remove = async () => {
    setDeleting(true);
    // Delete user_books entries first (the user's own copy), then book if no one else has it.
    if (user) {
      await supabase.from("user_books").delete().eq("user_id", user.id).eq("book_id", book.id);
    }
    setDeleting(false);
    toast.success("Removido da sua biblioteca");
    setOpen(false);
    navigate("/biblioteca");
  };

  const previewBook: Book = {
    ...book,
    title: form.title || book.title,
    authors: form.authors.split(",").map((s) => s.trim()).filter(Boolean),
    cover_url: form.cover_url || null,
    isbn_13: form.isbn_13 || null,
    isbn_10: form.isbn_10 || null,
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="lg" className="gap-2">
            <Pencil className="w-4 h-4" /> Editar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Editar livro</DialogTitle>
          <DialogDescription>
            Corrija ou complete os dados. Suas alterações ficam visíveis para todos.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-[180px_1fr] gap-6 pt-2">
          {/* Cover preview + actions */}
          <div className="space-y-3">
            <BookCover book={previewBook} size="lg" fallback={false} className="mx-auto" />
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])}
                />
                <span>
                  <Button asChild variant="outline" size="sm" className="w-full gap-2 cursor-pointer" disabled={uploading}>
                    <span>
                      {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Enviar foto
                    </span>
                  </Button>
                </span>
              </label>
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={findCover} disabled={searchingCover}>
                {searchingCover ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Buscar capa
              </Button>
              {form.cover_url && (
                <Button variant="ghost" size="sm" className="w-full gap-2 text-muted-foreground" onClick={() => set("cover_url", "")}>
                  <X className="w-3.5 h-3.5" /> Remover capa
                </Button>
              )}
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-3">
            {/* Refresh por ISBN — destaque no topo dos campos */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <RefreshCw className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">
                    Rebuscar livro pelo ISBN
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {form.isbn_13 || form.isbn_10
                      ? `Reprocessa metadados a partir do ISBN ${form.isbn_13 || form.isbn_10} em fontes públicas (BrasilAPI, OpenLibrary, Google Books).`
                      : "Sem ISBN cadastrado — tentaremos buscar por título e autor."}
                  </p>
                </div>
              </div>
              <Button
                variant="hero"
                size="sm"
                onClick={refreshData}
                disabled={refreshing}
                className="w-full gap-2"
              >
                {refreshing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {refreshing ? "Buscando dados atualizados…" : "Buscar dados atualizados"}
              </Button>
            </div>
            <Field label="Título *" value={form.title} onChange={(v) => set("title", v)} />
            <Field label="Subtítulo" value={form.subtitle} onChange={(v) => set("subtitle", v)} />
            <Field label="Autores (separe por vírgula)" value={form.authors} onChange={(v) => set("authors", v)} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Editora" value={form.publisher} onChange={(v) => set("publisher", v)} />
              <Field label="Ano" value={String(form.published_year)} onChange={(v) => set("published_year", v)} type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Páginas" value={String(form.page_count)} onChange={(v) => set("page_count", v)} type="number" />
              <Field label="Categorias (vírgula)" value={form.categories} onChange={(v) => set("categories", v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ISBN-13" value={form.isbn_13} onChange={(v) => set("isbn_13", v)} />
              <Field label="ISBN-10" value={form.isbn_10} onChange={(v) => set("isbn_10", v)} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={4}
                className="mt-1.5"
                placeholder="Sinopse, contexto, notas…"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 pt-4 border-t border-border/40 mt-4 flex-row justify-between flex-wrap">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="w-4 h-4" /> Remover da biblioteca
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display">Remover este livro?</AlertDialogTitle>
                <AlertDialogDescription>
                  O livro sairá da sua biblioteca, desejos e progresso. As resenhas que você publicou serão mantidas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={remove} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? "Removendo…" : "Remover"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="hero" onClick={save} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar alterações
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label, value, onChange, type = "text",
}: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input
        value={value}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5"
      />
    </div>
  );
}
