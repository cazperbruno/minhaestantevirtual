import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  clubId: string;
  clubName?: string;
  className?: string;
}

/** Botão para o admin baixar o relatório do clube em PDF. */
export function ExportClubReportButton({ clubId, clubName, className }: Props) {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/club-report-pdf`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ club_id: clubId }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(errText || `HTTP ${resp.status}`);
      }

      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (clubName || "clube").replace(/[^a-z0-9-_ ]/gi, "_").trim();
      a.href = objectUrl;
      a.download = `relatorio-${safeName || "clube"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success("Relatório gerado!");
    } catch (e) {
      console.error(e);
      toast.error("Não consegui gerar o PDF agora", {
        description: (e as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={loading}
      className={className}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Download className="w-3.5 h-3.5" />
      )}
      Exportar PDF
    </Button>
  );
}
