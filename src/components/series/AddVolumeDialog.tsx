/**
 * Diálogo para adicionar manualmente um volume a uma série existente.
 * Cria um novo registro em `books` vinculado via `series_id` e
 * já adiciona à biblioteca do usuário com status "not_read".
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { awardXp } from "@/lib/xp";
import type { SeriesDetail } from "@/hooks/useSeries";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: SeriesDetail;
}

export function AddVolumeDialog({ open, onOpenChange, detail }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { series, volumes } = detail;

  const nextSuggested = useMemo(() => {
    const nums = volumes.map((v) => v.volume_number).filter((n): n is number => typeof n === "number");
    if (nums.length === 0) return 1;
    return Math.max(...nums) + 1;
  }, [volumes]);

  const [volumeNumber, setVolumeNumber] = useState<string>(String(nextSuggested));
  const [title, setTitle] = useState<string>("");
  const [pageCount, setPageCount] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setVolumeNumber(String(nextSuggested));
    setTitle("");
    setPageCount("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const volNum = parseInt(volumeNumber, 10);
    if (isNaN(volNum) || volNum <= 0) {
      toast.error("Informe um número de volume válido");
      return;
    }
    if (volumes.some((v) => v.volume_number === volNum)) {
      toast.error(`Volume #${volNum} já existe nesta série`);
      return;
    }

    setSaving(true);
    const finalTitle = title.trim() || `${series.title} — Vol. ${volNum}`;
    const { data: book, error } = await supabase
      .from("books")
      .insert({
        title: finalTitle,
        authors: series.authors,
        content_type: series.content_type,
        series_id: series.id,
        volume_number: volNum,
        cover_url: series.cover_url,
        page_count: pageCount ? parseInt(pageCount, 10) || null : null,
        source: "manual",
      })
      .select()
      .single();

    if (error || !book) {
      console.error(error);
      toast.error("Não foi possível adicionar o volume");
      setSaving(false);
      return;
    }

    const { error: ubError } = await supabase.from("user_books").insert({
      user_id: user.id,
      book_id: book.id,
      status: "not_read",
    });
    if (ubError) console.warn("user_books insert", ubError);

    void awardXp(user.id, "add_book", { meta: { manual_volume: true, series_id: series.id } });

    toast.success(`Volume #${volNum} adicionado`);
    qc.invalidateQueries({ queryKey: ["series", series.id] });
    qc.invalidateQueries({ queryKey: ["mySeries"] });
    qc.invalidateQueries({ queryKey: ["library"] });

    reset();
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Adicionar volume manualmente</DialogTitle>
          <DialogDescription>
            Use quando o volume ainda não estiver no AniList ou catálogo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="vol">Nº do volume</Label>
              <Input
                id="vol"
                type="number"
                min="1"
                value={volumeNumber}
                onChange={(e) => setVolumeNumber(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="pg">Páginas (opcional)</Label>
              <Input
                id="pg"
                type="number"
                min="1"
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="title">Título (opcional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`${series.title} — Vol. ${volumeNumber || "?"}`}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Se vazio, usaremos o nome da série + número do volume.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" variant="hero" disabled={saving}>
              {saving ? "Adicionando…" : "Adicionar volume"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
