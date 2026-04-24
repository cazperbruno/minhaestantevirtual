/**
 * Sanitização de HTML/texto contra XSS armazenado.
 *
 * Quando exibimos conteúdo gerado pelo usuário (bio, reviews, descrições),
 * usamos DOMPurify para remover qualquer markup malicioso. A maior parte
 * do app já renderiza tudo como texto puro via React, mas centralizar
 * a função aqui dá uma defesa extra em profundidade caso algum dia
 * alguém mude para `dangerouslySetInnerHTML`.
 */
import DOMPurify from "isomorphic-dompurify";

/**
 * Remove TODO o HTML — devolve só texto. Use para bio/reviews onde
 * nenhum markup é permitido.
 */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return "";
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

/**
 * Permite HTML mínimo (negrito, itálico, links). Use só em campos
 * onde queremos formatação leve.
 */
export function sanitizeRichText(input: string | null | undefined): string {
  if (!input) return "";
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "br", "p"],
    ALLOWED_ATTR: ["href", "target", "rel"],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}

/**
 * Valida se uma URL externa é segura (http/https) — usar antes de
 * exibir links de profile (instagram, twitter, website).
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
