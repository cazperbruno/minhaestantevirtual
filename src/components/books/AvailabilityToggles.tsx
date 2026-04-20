import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { ArrowRightLeft, BookOpen } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userBookId: string;
  initialTrade?: boolean;
  initialLoan?: boolean;
  compact?: boolean;
}

export function AvailabilityToggles({ userBookId, initialTrade = false, initialLoan = false, compact = false }: Props) {
  const [trade, setTrade] = useState(initialTrade);
  const [loan, setLoan] = useState(initialLoan);

  const update = async (field: "available_for_trade" | "available_for_loan", value: boolean) => {
    const { error } = await supabase.from("user_books").update({ [field]: value }).eq("id", userBookId);
    if (error) toast.error("Erro ao atualizar");
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <Row
        icon={<ArrowRightLeft className="w-3.5 h-3.5 text-primary" />}
        label="Disponível para troca"
        checked={trade}
        onChange={(v) => { setTrade(v); update("available_for_trade", v); }}
      />
      <Row
        icon={<BookOpen className="w-3.5 h-3.5 text-primary" />}
        label="Disponível para empréstimo"
        checked={loan}
        onChange={(v) => { setLoan(v); update("available_for_loan", v); }}
      />
    </div>
  );
}

function Row({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer group">
      <span className="flex items-center gap-2 text-sm">
        {icon}
        <span className="group-hover:text-primary transition-colors">{label}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
