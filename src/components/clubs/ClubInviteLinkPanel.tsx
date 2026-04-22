import { useState } from "react";
import {
  useClubInviteLink, useCreateInviteLink, useRevokeInviteLink,
} from "@/hooks/useClubInviteLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Link2, Copy, Check, RotateCw, Trash2, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  clubId: string;
  clubName?: string;
}

/** Painel para o admin gerar/compartilhar/revogar link de convite. */
export function ClubInviteLinkPanel({ clubId, clubName }: Props) {
  const link = useClubInviteLink(clubId, true);
  const create = useCreateInviteLink(clubId);
  const revoke = useRevokeInviteLink(clubId);

  const [expires, setExpires] = useState<string>("7");
  const [maxUses, setMaxUses] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const inviteUrl = link.data ? `${baseUrl}/clubes/convite/${link.data.token}` : null;

  const handleCreate = () => {
    create.mutate({
      expires_in_days: expires === "never" ? undefined : Number(expires),
      max_uses: maxUses ? Number(maxUses) : null,
    });
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não consegui copiar");
    }
  };

  const handleShare = async () => {
    if (!inviteUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: clubName ? `Entre no clube ${clubName}` : "Convite de clube de leitura",
          text: clubName ? `Junte-se a "${clubName}" no Readify!` : "Junte-se ao meu clube no Readify!",
          url: inviteUrl,
        });
      } catch {/* user cancel */}
    } else {
      handleCopy();
    }
  };

  return (
    <section className="rounded-xl bg-card/40 border border-border/30 p-3 space-y-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
        <Link2 className="w-3 h-3" /> Link de convite
      </p>

      {link.isLoading ? (
        <div className="py-4 flex justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </div>
      ) : link.data && inviteUrl ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Input
              value={inviteUrl}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              className="text-xs h-9 font-mono"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              onClick={handleCopy}
              aria-label="Copiar link"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              onClick={handleShare}
              aria-label="Compartilhar"
            >
              <Share2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {link.data.uses} uso{link.data.uses === 1 ? "" : "s"}
              {link.data.max_uses ? ` / ${link.data.max_uses}` : ""}
              {link.data.expires_at &&
                ` · expira ${new Date(link.data.expires_at).toLocaleDateString("pt-BR")}`}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] gap-1"
                disabled={create.isPending}
                onClick={handleCreate}
              >
                <RotateCw className="w-3 h-3" /> Novo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] gap-1 text-destructive hover:text-destructive"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(link.data!.id)}
              >
                <Trash2 className="w-3 h-3" /> Revogar
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Gere um link para qualquer pessoa entrar direto no clube.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Select value={expires} onValueChange={setExpires}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Expira em 1 dia</SelectItem>
                <SelectItem value="7">Expira em 7 dias</SelectItem>
                <SelectItem value="30">Expira em 30 dias</SelectItem>
                <SelectItem value="never">Não expira</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              placeholder="Máx. usos (opcional)"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="hero"
            className="w-full gap-1.5"
            disabled={create.isPending}
            onClick={handleCreate}
          >
            {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Gerar link de convite
          </Button>
        </div>
      )}
    </section>
  );
}
