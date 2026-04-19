import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Upload, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { resolveCover } from "@/lib/cover-fallback";
import { BookCover } from "./BookCover";
import type { Book } from "@/types/book";

interface Props {
  initialTitle?: string;
  trigger?: React.ReactNode;
  onCreated?: (book: Book) => void;
}

export function AddBookManualDialog({ initialTitle, trigger, onCreated }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchingCover, setSearchingCover] = useState(false);

  const [form, setForm] = useState({
    title: initialTitle ?? "",
    authors: "",
    publisher: "",
    published_year: "",
    page_count: "",
    isbn_13: "",
    description: "",
    cover_url: "",
    categories: "",
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const uploadCover = async (file: File) => {
    if (!user) return toast.error("Entre primeiro");
    if (file.size > 5 * 1024 * 1024) return toast.error("Máx 5MB");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/manual-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("book-covers").upload(path, file, { upsert: true });
      if (error) throw error;
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
    const found = await resolveCover({
      cover_url: null,
      isbn_13: form.isbn_13 || null,
      isbn_10: null,
      title: form.title,
      authors: form.authors.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setSearchingCover(false);
    if (found) {
      set("cover_url", found);
      toast.success("Capa encontrada");
    } else {
      toast.error("Nada encontrado — envie uma foto");
    }
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("Título obrigatório");
    if (!user) return toast.error("Entre primeiro");
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      authors: form.authors.split(",").map((s) => s.trim()).filter(Boolean),
      publisher: form.publisher.trim() || null,
      published_year: form.published_year ? Number(form.published_year) : null,
      page_count: form.page_count ? Number(form.page_count) : null,
      isbn_13: form.isbn_13.trim() || null,
      description: form.description.trim() || null,
      cover_url: form.cover_url.trim() || null,
      categories: form.categories.split(",").map((s) => s.trim()).filter(Boolean),
      source: "manual",
    };
    const { data, error } = await supabase.from("books").insert(payload).select().single();
    if (error || !data) {
      setSaving(false);
      toast.error("Erro: " + (error?.message || ""));
      return;
    }
    // Auto-add to user library
    await supabase.from("user_books").insert({
      user_id: user.id,
      book_id: data.id,
      status: "not_read",
    });
    setSaving(false);
    toast.success("Livro adicionado à sua biblioteca");
    onCreated?.(data as Book);
    setOpen(false);
    navigate(`/livro/${data.id}`);
  };

  const previewBook = {
    title: form.title || "Novo livro",
    authors: form.authors.split(",").map((s) => s.trim()).filter(Boolean),
    cover_url: form.cover_url || null,
    isbn_13: form.isbn_13 || null,
    isbn_10: null,
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="hero" className="gap-2">
            <Plus className="w-4 h-4" /> Adicionar manualmente
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Novo livro</DialogTitle>
          <DialogDescription>
            Não encontrou nas buscas? Cadastre você mesmo. Adicionamos à sua biblioteca automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-[160px_1fr] gap-5 pt-2">
          <div className="space-y-2">
            <BookCover book={previewBook} size="lg" fallback={false} interactive={false} className="mx-auto" />
            <label className="cursor-pointer block">
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} />
              <Button asChild variant="outline" size="sm" className="w-full gap-2 cursor-pointer" disabled={uploading}>
                <span>
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Foto
                </span>
              </Button>
            </label>
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={findCover} disabled={searchingCover}>
              {searchingCover ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              Buscar
            </Button>
          </div>

          <div className="space-y-3">
            <Field label="Título *" value={form.title} onChange={(v) => set("title", v)} />
            <Field label="Autores (vírgula)" value={form.authors} onChange={(v) => set("authors", v)} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Editora" value={form.publisher} onChange={(v) => set("publisher", v)} />
              <Field label="Ano" value={form.published_year} onChange={(v) => set("published_year", v)} type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Páginas" value={form.page_count} onChange={(v) => set("page_count", v)} type="number" />
              <Field label="ISBN" value={form.isbn_13} onChange={(v) => set("isbn_13", v)} />
            </div>
            <Field label="Categorias (vírgula)" value={form.categories} onChange={(v) => set("categories", v)} />
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sinopse</Label>
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
                className="mt-1.5"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 border-t border-border/40 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="hero" onClick={save} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Adicionar à biblioteca
          </Button>
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
      <Input value={value} type={type} onChange={(e) => onChange(e.target.value)} className="mt-1.5" />
    </div>
  );
}
