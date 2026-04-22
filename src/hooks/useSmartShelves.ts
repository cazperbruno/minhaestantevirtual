import { useMemo } from "react";
import type { UserBook } from "@/types/book";

export interface SmartShelf {
  id: string;
  title: string;
  subtitle?: string;
  items: UserBook[];
  /** Used to order shelves: lower = more important. */
  priority: number;
  /** Optional emoji/icon string for richer UI. */
  emoji?: string;
}

const RECENT_DAYS = 30;
const REDISCOVER_DAYS = 180; // ~6 meses
const STALLED_DAYS = 21;     // sem mexer no progresso há 3 semanas
const MAX_SHELVES = 10;      // teto duro pra evitar feed-spam

const daysAgo = (n: number) => Date.now() - n * 24 * 60 * 60 * 1000;
const ts = (s?: string | null) => (s ? new Date(s).getTime() : 0);

/**
 * Gera prateleiras dinâmicas a partir da biblioteca do usuário (estilo Netflix).
 *
 * REGRAS DE OURO (refatoração 2026-04):
 *  - Máximo de MAX_SHELVES prateleiras (mais que isso vira ruído).
 *  - Dedupe entre prateleiras: livros que já apareceram em prateleiras de
 *    PRIORIDADE ALTA (continue/almost-done/stalled/recent/just-finished/favs)
 *    NÃO se repetem nas categorias semânticas (gênero/autor/década), evitando
 *    a sensação de "vendo o mesmo livro 5x".
 *  - Threshold mínimo de 3 itens em quase tudo (4 em recentReleases/clássicos).
 *  - "Porque você leu X" só aparece quando há ≥4 candidatos relacionados.
 *  - Ordem reflete utilidade: ação > recência > preferência > metadado.
 */
export function useSmartShelves(items: UserBook[]): SmartShelf[] {
  return useMemo(() => {
    if (!items.length) return [];
    const shelves: SmartShelf[] = [];

    const reading = items.filter((i) => i.status === "reading");
    const read = items.filter((i) => i.status === "read");
    const wishlist = items.filter((i) => i.status === "wishlist");
    const acquired = items.filter((i) => i.status === "not_read");
    const favorites = items.filter((i) => (i.rating ?? 0) >= 4);

    const progress = (ub: UserBook) => {
      const total = ub.book?.page_count || 0;
      const cur = ub.current_page || 0;
      return total > 0 ? Math.min(1, cur / total) : 0;
    };

    /** Livros que já apareceram em uma prateleira "topo" — não voltam abaixo. */
    const topUsed = new Set<string>();
    const without = (list: UserBook[]) => list.filter((i) => !topUsed.has(i.id));

    // ─── 1. Continue lendo ───────────────────────────────────
    if (reading.length) {
      const sorted = reading
        .slice()
        .sort((a, b) => ts(b.updated_at) - ts(a.updated_at))
        .slice(0, 20);
      sorted.forEach((i) => topUsed.add(i.id));
      shelves.push({
        id: "continue",
        emoji: "▶️",
        title: "Continue lendo",
        subtitle: "Volte de onde parou",
        items: sorted,
        priority: 0,
      });
    }

    // ─── 2. Quase terminando (>= 70%) ────────────────────────
    const almostDone = reading
      .filter((i) => progress(i) >= 0.7 && progress(i) < 1)
      .sort((a, b) => progress(b) - progress(a));
    if (almostDone.length >= 2) {
      almostDone.slice(0, 12).forEach((i) => topUsed.add(i.id));
      shelves.push({
        id: "almost-done",
        emoji: "🏁",
        title: "Quase terminando",
        subtitle: "Falta pouco — finalize esses",
        items: almostDone.slice(0, 20),
        priority: 1,
      });
    }

    // ─── 3. Esquecidos (em leitura, sem update há 3 semanas) ─
    const stalled = reading
      .filter((i) => ts(i.updated_at) < daysAgo(STALLED_DAYS))
      .sort((a, b) => ts(a.updated_at) - ts(b.updated_at));
    if (stalled.length >= 2) {
      stalled.slice(0, 12).forEach((i) => topUsed.add(i.id));
      shelves.push({
        id: "stalled",
        emoji: "⏰",
        title: "Hora de retomar",
        subtitle: "Você pausou esses há um tempo",
        items: stalled.slice(0, 20),
        priority: 2,
      });
    }

    // ─── 4. Adicionados recentemente ─────────────────────────
    const recent = items
      .filter((i) => ts(i.created_at) > daysAgo(RECENT_DAYS))
      .sort((a, b) => ts(b.created_at) - ts(a.created_at))
      .slice(0, 20);
    if (recent.length >= 4) {
      recent.slice(0, 12).forEach((i) => topUsed.add(i.id));
      shelves.push({
        id: "recent",
        emoji: "✨",
        title: "Adicionados recentemente",
        subtitle: "Novos na sua coleção",
        items: recent,
        priority: 3,
      });
    }

    // ─── 5. Concluídos recentemente ──────────────────────────
    const justFinished = read
      .filter((i) => ts(i.finished_at ?? i.updated_at) > daysAgo(60))
      .sort(
        (a, b) =>
          ts(b.finished_at ?? b.updated_at) - ts(a.finished_at ?? a.updated_at),
      );
    if (justFinished.length >= 3) {
      justFinished.slice(0, 12).forEach((i) => topUsed.add(i.id));
      shelves.push({
        id: "just-finished",
        emoji: "🎉",
        title: "Concluídos recentemente",
        subtitle: "Suas últimas conquistas",
        items: justFinished.slice(0, 20),
        priority: 4,
      });
    }

    // ─── 6. Favoritos (4-5★) ─────────────────────────────────
    if (favorites.length >= 3) {
      const favSorted = favorites
        .slice()
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 20);
      favSorted.slice(0, 8).forEach((i) => topUsed.add(i.id));
      shelves.push({
        id: "favorites",
        emoji: "⭐",
        title: "Seus favoritos",
        subtitle: "Os que você mais amou",
        items: favSorted,
        priority: 5,
      });
    }

    // ─── 7. Quero ler (fila ativa) ───────────────────────────
    if (wishlist.length >= 3) {
      shelves.push({
        id: "wishlist",
        emoji: "🎯",
        title: "Na sua fila",
        subtitle: `${wishlist.length} esperando você`,
        items: wishlist.slice(0, 20),
        priority: 6,
      });
    }

    // ─── 8. No acervo (não lidos) ────────────────────────────
    if (acquired.length >= 3) {
      shelves.push({
        id: "acquired",
        emoji: "📦",
        title: "No seu acervo",
        subtitle: "Esperando uma chance",
        items: acquired.slice(0, 20),
        priority: 7,
      });
    }

    // ─── 9. Tipos de conteúdo (mangá/quadrinhos/revistas) ────
    // Mostra APENAS o tipo dominante (não-livro) com mais itens.
    const byType = new Map<string, UserBook[]>();
    for (const i of items) {
      const t = i.book?.content_type;
      if (!t || t === "book") continue;
      const list = byType.get(t) ?? [];
      list.push(i);
      byType.set(t, list);
    }
    const TYPE_META: Record<string, { title: string; emoji: string }> = {
      manga: { title: "Mangás", emoji: "📖" },
      comic: { title: "Quadrinhos", emoji: "🦸" },
      magazine: { title: "Revistas", emoji: "📰" },
    };
    const topType = [...byType.entries()]
      .filter(([, list]) => list.length >= 3)
      .sort((a, b) => b[1].length - a[1].length)[0];
    if (topType) {
      const [type, list] = topType;
      const meta = TYPE_META[type] ?? { title: type, emoji: "📚" };
      shelves.push({
        id: `type-${type}`,
        emoji: meta.emoji,
        title: meta.title,
        subtitle: `${list.length} ${list.length === 1 ? "título" : "títulos"} na coleção`,
        items: list.slice(0, 20),
        priority: 10,
      });
    }

    // ─── 10. Por gênero (TOP 3 — não 5) ──────────────────────
    // Aplica dedupe contra prateleiras de topo + threshold maior (4 itens).
    const genreCount = new Map<string, UserBook[]>();
    for (const i of items) {
      const cats = i.book?.categories ?? [];
      for (const c of cats) {
        if (!c) continue;
        const list = genreCount.get(c) ?? [];
        list.push(i);
        genreCount.set(c, list);
      }
    }
    const topGenres = [...genreCount.entries()]
      .map(([g, list]) => [g, without(list)] as const)
      .filter(([, list]) => list.length >= 4)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3);
    topGenres.forEach(([genre, list], idx) => {
      shelves.push({
        id: `genre-${genre}`,
        emoji: "🏷️",
        title: genre,
        subtitle: `${list.length} ${list.length === 1 ? "livro" : "livros"} desse gênero`,
        items: list.slice(0, 20),
        priority: 20 + idx,
      });
    });

    // ─── 11. Por autor (TOP 2 — não 4) ───────────────────────
    const authorCount = new Map<string, UserBook[]>();
    for (const i of items) {
      const a = i.book?.authors?.[0];
      if (!a) continue;
      const list = authorCount.get(a) ?? [];
      list.push(i);
      authorCount.set(a, list);
    }
    const topAuthors = [...authorCount.entries()]
      .map(([a, list]) => [a, without(list)] as const)
      .filter(([, list]) => list.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 2);
    topAuthors.forEach(([author, list], idx) => {
      shelves.push({
        id: `author-${author}`,
        emoji: "✍️",
        title: `Mais de ${author}`,
        subtitle: `${list.length} obras na sua biblioteca`,
        items: list.slice(0, 20),
        priority: 30 + idx,
      });
    });

    // ─── 12. Lançamentos (últimos 3 anos) ────────────────────
    const currentYear = new Date().getFullYear();
    const recentReleases = without(items)
      .filter((i) => {
        const y = i.book?.published_year;
        return y && y >= currentYear - 3;
      })
      .sort(
        (a, b) =>
          (b.book?.published_year ?? 0) - (a.book?.published_year ?? 0),
      );
    if (recentReleases.length >= 4) {
      shelves.push({
        id: "new-releases",
        emoji: "🆕",
        title: "Lançamentos",
        subtitle: "Publicados nos últimos 3 anos",
        items: recentReleases.slice(0, 20),
        priority: 40,
      });
    }

    // ─── 13. Clássicos ───────────────────────────────────────
    const classics = without(items)
      .filter((i) => {
        const y = i.book?.published_year;
        return y && y > 0 && y < 1970;
      })
      .sort(
        (a, b) =>
          (a.book?.published_year ?? 0) - (b.book?.published_year ?? 0),
      );
    if (classics.length >= 4) {
      shelves.push({
        id: "classics",
        emoji: "🏛️",
        title: "Clássicos da sua estante",
        subtitle: "Publicados antes de 1970",
        items: classics.slice(0, 20),
        priority: 41,
      });
    }

    // ─── 14. Releitura recomendada (4-5★ lidos há > 6 meses) ──
    const rereadable = read
      .filter(
        (i) =>
          (i.rating ?? 0) >= 4 &&
          ts(i.finished_at ?? i.updated_at) < daysAgo(REDISCOVER_DAYS),
      )
      .sort(
        (a, b) =>
          ts(a.finished_at ?? a.updated_at) -
          ts(b.finished_at ?? b.updated_at),
      );
    if (rereadable.length >= 3) {
      shelves.push({
        id: "reread",
        emoji: "🔁",
        title: "Bons para reler",
        subtitle: "Você amou — talvez seja hora de revisitar",
        items: rereadable.slice(0, 20),
        priority: 50,
      });
    }

    // ─── 15. Porque você leu X (último 4-5★) ─────────────────
    // Threshold subido pra ≥4 candidatos pra evitar prateleira fraca.
    const lastFav = read
      .filter((i) => (i.rating ?? 0) >= 4 && i.book)
      .sort(
        (a, b) =>
          ts(b.finished_at ?? b.updated_at) -
          ts(a.finished_at ?? a.updated_at),
      )[0];

    if (lastFav?.book) {
      const seedAuthor = lastFav.book.authors?.[0];
      const seedCats = new Set(lastFav.book.categories ?? []);
      const related = items.filter((i) => {
        if (i.id === lastFav.id) return false;
        if (i.status === "read") return false;
        const sameAuthor =
          !!seedAuthor && i.book?.authors?.includes(seedAuthor);
        const sameGenre = (i.book?.categories ?? []).some((c) =>
          seedCats.has(c),
        );
        return sameAuthor || sameGenre;
      });
      if (related.length >= 4) {
        shelves.push({
          id: `because-${lastFav.id}`,
          emoji: "💡",
          title: `Porque você leu ${lastFav.book.title}`,
          subtitle: "Mais como esse na sua biblioteca",
          items: related.slice(0, 20),
          priority: 60,
        });
      }
    }

    // Ordena por prioridade e aplica teto duro.
    return shelves.sort((a, b) => a.priority - b.priority).slice(0, MAX_SHELVES);
  }, [items]);
}
