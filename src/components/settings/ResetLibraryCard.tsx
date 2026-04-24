import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Card destrutivo: zera a biblioteca pessoal (livros, prateleiras, reviews,
 * trocas, empréstimos, atividades) mas MANTÉM a conta e o perfil.
 * Exige confirmação digitando "ZERAR".
 */
export function ResetLibraryCard() {
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const handleReset = async () => {
    if (confirm !== "ZERAR") {
      toast.error('Digite "ZERAR" para confirmar');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("reset_my_library" as any);
    setLoading(false);
    if (error) {
      toast.error("Não foi possível zerar a biblioteca");
      return;
    }
    const counts = (data || {}) as Record<string, number>;
    const total = Object.values(counts).reduce((a, b) => a + (b || 0), 0);
    toast.success(
      total > 0
        ? `Biblioteca zerada — ${total} item(ns) removido(s)`
        : "Biblioteca já estava vazia",
    );
    qc.clear();
    setConfirm("");
    setOpen(false);
    // Reload para garantir estado limpo em todos os lugares
    setTimeout(() => window.location.reload(), 600);
  };

  return (
    <section className="glass rounded-2xl p-5 border-destructive/30">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-destructive" />
        <h2 className="font-display text-lg font-semibold">Zona de risco</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Zera toda a sua biblioteca: livros, prateleiras, avaliações, trocas, empréstimos e
        atividades. Sua conta e perfil <strong>continuam ativos</strong>. Essa ação não pode ser
        desfeita.
      </p>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" className="gap-2">
            <RotateCcw className="w-3.5 h-3.5" /> Começar do zero
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Tem certeza absoluta?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Tudo da sua biblioteca será apagado para sempre — livros lidos, lendo, desejos,
                emprestados, avaliações, trocas e histórico de atividades.
              </span>
              <span className="block text-foreground font-semibold">
                Esta ação não pode ser desfeita.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm" className="text-xs">
              Digite <span className="font-mono font-bold text-destructive">ZERAR</span> para
              confirmar
            </Label>
            <Input
              id="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.toUpperCase())}
              placeholder="ZERAR"
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleReset();
              }}
              disabled={loading || confirm !== "ZERAR"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Zerar biblioteca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
