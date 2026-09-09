import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportTextFile } from "@/platform/files";
import { toast } from "sonner";

/**
 * Painel LGPD / stores: portabilidade e eliminação iniciadas pelo próprio usuário.
 */
export function PrivacyDataPanel() {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const exportData = async () => {
    setExporting(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        toast.error("Sessão expirada. Entre novamente.");
        return;
      }

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-user-data`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}));
        throw new Error(errorPayload?.error || "Falha ao exportar");
      }

      const text = await res.text();
      // Garante que o arquivo retornado é JSON válido antes de entregá-lo ao usuário.
      JSON.parse(text);

      const result = await exportTextFile(
        `readify-meus-dados-${new Date().toISOString().slice(0, 10)}.json`,
        text,
      );

      toast.success(
        result === "shared"
          ? "Exportação pronta para salvar ou compartilhar"
          : "Download iniciado",
      );
    } catch (e: any) {
      console.error("[privacy] export failed", e);
      toast.error("Não foi possível exportar seus dados");
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (confirmText !== "EXCLUIR") {
      toast.error('Digite "EXCLUIR" para confirmar');
      return;
    }

    setDeleting(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error("session_expired");
      }

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user-account`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: "DELETE" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "delete_failed");
      }

      await supabase.auth.signOut();
      setConfirmText("");
      toast.success("Conta excluída");
      navigate("/auth", { replace: true });
    } catch (e: any) {
      console.error("[privacy] account deletion failed", e);
      toast.error("Não foi possível excluir sua conta", {
        description: "Nenhuma exclusão parcial será considerada concluída. Tente novamente.",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="glass rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-lg font-semibold">Meus dados e conta</h2>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Baixe uma cópia dos seus dados ou solicite a exclusão permanente da sua conta.
          No aplicativo móvel, a exportação abre as opções nativas para salvar ou compartilhar o arquivo.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={exportData}
          disabled={exporting || deleting}
          className="w-full gap-2"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
          Exportar meus dados (JSON)
        </Button>
      </div>

      <div className="border-t border-border/40 pt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={exporting} className="w-full gap-2">
              <Trash2 className="w-4 h-4" aria-hidden="true" /> Excluir minha conta
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir conta permanentemente?</AlertDialogTitle>
              <AlertDialogDescription>
                Seus dados pessoais, biblioteca, resenhas, interações, conquistas e XP serão removidos.
                Recursos compartilhados com outras pessoas podem ser preservados sem sua conta; por exemplo,
                um clube com outros membros pode ter a administração transferida. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirm-delete" className="text-xs">
                Digite <span className="font-mono font-bold">EXCLUIR</span> para confirmar
              </Label>
              <Input
                id="confirm-delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="EXCLUIR"
                autoComplete="off"
                disabled={deleting}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting} onClick={() => setConfirmText("")}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmText !== "EXCLUIR" || deleting}
                onClick={deleteAccount}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir definitivamente"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
