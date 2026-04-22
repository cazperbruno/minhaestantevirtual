import { Link } from "react-router-dom";
import { Fragment, useMemo } from "react";
import { profilePath } from "@/lib/profile-path";
import { cn } from "@/lib/utils";

interface MentionableMember {
  user_id: string;
  username: string | null;
  display_name: string | null;
}

interface Props {
  text: string;
  members: MentionableMember[];
  /** Cor do link (varia conforme bolha própria/alheia). */
  highlightClassName?: string;
}

const MENTION_RE = /(^|\s)@([A-Za-z0-9_\.]{2,30})/g;

/**
 * Renderiza o conteúdo de uma mensagem do clube transformando @username em link
 * para o perfil do membro mencionado. Se o username não pertencer a um membro
 * conhecido, mostra apenas o texto original.
 */
export function MessageContent({ text, members, highlightClassName }: Props) {
  const memberByUsername = useMemo(() => {
    const m = new Map<string, MentionableMember>();
    for (const mb of members) {
      if (mb.username) m.set(mb.username.toLowerCase(), mb);
    }
    return m;
  }, [members]);

  const parts = useMemo(() => {
    const out: Array<{ type: "text" | "mention"; value: string; member?: MentionableMember }> = [];
    let lastIndex = 0;
    const re = new RegExp(MENTION_RE.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const [whole, lead, uname] = match;
      const start = match.index + lead.length;
      if (start > lastIndex) out.push({ type: "text", value: text.slice(lastIndex, start) });
      const member = memberByUsername.get(uname.toLowerCase());
      if (member) {
        out.push({ type: "mention", value: `@${uname}`, member });
      } else {
        out.push({ type: "text", value: `@${uname}` });
      }
      lastIndex = match.index + whole.length;
    }
    if (lastIndex < text.length) out.push({ type: "text", value: text.slice(lastIndex) });
    return out;
  }, [text, memberByUsername]);

  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "mention" && p.member) {
          return (
            <Link
              key={i}
              to={profilePath({ username: p.member.username, id: p.member.user_id })}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "font-semibold underline decoration-dotted underline-offset-2 hover:no-underline",
                highlightClassName ?? "text-primary",
              )}
            >
              {p.value}
            </Link>
          );
        }
        return <Fragment key={i}>{p.value}</Fragment>;
      })}
    </>
  );
}
