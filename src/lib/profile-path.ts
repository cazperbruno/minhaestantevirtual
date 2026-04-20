/**
 * Gera o caminho do perfil público de um leitor.
 * Usa @username quando disponível (URL bonita) e cai no UUID como fallback.
 * O componente PublicProfile aceita os dois formatos.
 */
export function profilePath(p?: { id?: string | null; username?: string | null } | null): string {
  if (!p) return "#";
  if (p.username) return `/u/${p.username.replace(/^@+/, "")}`;
  if (p.id) return `/u/${p.id}`;
  return "#";
}
