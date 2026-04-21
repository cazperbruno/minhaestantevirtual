/**
 * Normalização de títulos para detecção/agrupamento de séries.
 *
 * Estratégia equilibrada:
 *  - remove indicadores de volume ("vol.", "volume", "tomo", "v.", "#")
 *  - remove números de volume no fim do título
 *  - remove sufixos comuns ("- vol 3", ": Volume 5", "(Vol. 2)")
 *  - normaliza acentos, lowercase, espaços e pontuação
 *  - extrai número de volume detectado para uso separado
 *
 * Usado por:
 *  - SeriesDetail (agrupar volumes existentes)
 *  - edge function consolidate-series (criar/mesclar séries)
 *  - sugestões "Continuação / mesma série" no BookDetail
 */

const VOL_KEYWORDS =
  "vol(?:ume|\\.)?|tome|tomo|book|livro|capitulo|chapter|cap\\.?|n[º°o]?\\.?|#";

/** Remove acentos e lowercase. */
export function strFold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Resultado da extração: título base + número de volume detectado (se houver). */
export interface NormalizedTitle {
  base: string;
  volume: number | null;
  /** Versão "fingerprint" — só letras/números, ideal para chave de hash. */
  key: string;
}

/**
 * Tenta separar um título em "série base" + "número do volume".
 *
 * Exemplos:
 *  - "Boa Noite Punpun Vol. 3" → { base: "boa noite punpun", volume: 3 }
 *  - "Sandman: Volume 1"       → { base: "sandman", volume: 1 }
 *  - "Berserk #12"             → { base: "berserk", volume: 12 }
 *  - "1984"                    → { base: "1984", volume: null } (número como título único)
 *  - "Dom Casmurro"            → { base: "dom casmurro", volume: null }
 */
export function normalizeSeriesTitle(rawTitle: string): NormalizedTitle {
  if (!rawTitle) return { base: "", volume: null, key: "" };
  let t = strFold(rawTitle);

  // Remove parênteses/colchetes inteiros (geralmente edição/ano/extras)
  t = t.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");

  // Captura volume com keywords explícitos: "vol 3", "volume 12", "tomo 4"
  let detectedVol: number | null = null;
  const volKwRe = new RegExp(
    `(?:^|[\\s\\-:,.])(?:${VOL_KEYWORDS})\\s*(\\d{1,3})(?!\\d)`,
    "i",
  );
  const mKw = t.match(volKwRe);
  if (mKw) {
    detectedVol = parseInt(mKw[1], 10);
    t = t.replace(mKw[0], " ").trim();
  } else {
    // Captura "número solto no fim" — só se houver palavras antes (evita "1984")
    const mTail = t.match(/^(.+?\b[a-zA-Z][a-zA-Z\s]+)\s+(\d{1,3})\s*$/);
    if (mTail && mTail[2]) {
      detectedVol = parseInt(mTail[2], 10);
      t = mTail[1];
    }
  }

  // Remove separadores residuais no fim ("- ", ": ", ", ")
  t = t.replace(/[\s\-:,.\u2013\u2014]+$/g, "").trim();
  // Colapsa espaços
  t = t.replace(/\s+/g, " ").trim();

  // Chave fingerprint — só [a-z0-9]
  const key = t.replace(/[^a-z0-9]+/g, "");

  return { base: t, volume: detectedVol, key };
}

/**
 * Distância normalizada entre 2 chaves (0..1, 1 = igual).
 * Implementação leve baseada em sets de bigramas (Dice coefficient).
 * Sem dependência externa, O(n).
 */
export function similarityKey(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string): Set<string> => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/** Similaridade ≥ threshold (default 0.85). */
export function isLikelySameSeries(a: string, b: string, threshold = 0.85): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Containment forte: chave mais curta inteiramente contida na maior + ≥ 70% do tamanho
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (l.includes(s) && s.length / l.length >= 0.7) return true;
  return similarityKey(a, b) >= threshold;
}
