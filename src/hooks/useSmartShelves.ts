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

const daysAgo = (n: number) => Date.now() - n * 24 * 60 * 60 * 1000;
const ts = (s?: string | null) => (s ? new Date(s).getTime() : 0);

/**
 * Gera prateleiras dinâmicas a partir da biblioteca do usuário (estilo Netflix).
 *
 * Categorias automáticas (todas só aparecem se houver dados suficientes):
 *  - Continue lendo / Quase terminando / Mal começados / Esquecidos
 *  - Adicionados recentemente / Concluídos recentemente
 *  - Favoritos / Joias escondidas (4-5★ pouco lidos no app)
 *  - Quero ler / No acervo
 *  - Por gênero (top 5) / Por autor (top 4)
 *  - Por década (anos 80, 90, 2000…)
 *  - Por idioma (quando há mistura)
 *  - Mangás / Quadrinhos / Revistas (separados)
 *  - Livros curtos (< 200 pág) / Leituras longas (> 500 pág)
 *  - Clássicos (publicados antes de 1970)
 *  - Lançamentos (últimos 3 anos)
 *  - Releitura recomendada (lidos há > 6 meses, 4-5★)
 *  - Porque você leu X (último 4-5★) — autor + gênero
 *  - Mais do mesmo editor (top editora)
 *
 *  Tudo client-side, memoizado. Nunca retorna prateleira vazia.
 */
export function useSmartShelves(items: UserBook[]): SmartShelf[] {
  return useMemo(() => {
    if (!items.length) return [];
    const shelves: SmartShelf[] = [];
    const now = Date.now();

    const reading = items.filter((i) => i.status === "reading");
    const read = items.filter((i) => i.status === "read");
    const wishlist = items.filter((i) => i.status === "wishlist");
    const acquired = items.filter((i) => i.status === "not_read");
    const favorites = items.filter((i) => (i.rating ?? 0) >= 4);

    // helpers de progresso
    const progress = (ub: UserBook) => {
      const total = ub.book?.page_count || 0;
      const cur = ub.current_page || 0;
      return total > 0 ? Math.min(1, cur / total) : 0;
    };

    // ─── 1. Continue lendo ───────────────────────────────────
    if (reading.length) {
      shelves.push({
        id: "continue",
        emoji: "▶️",
        title: "Continue lendo",
        subtitle: "Volte de onde parou",
        items: reading
          .slice()
          .sort((a, b) => ts(b.updated_at) - ts(a.updated_at))
          .slice(0, 20),
        priority: 0,
      });
    }

    // ─── 2. Quase terminando (>= 75%) ────────────────────────
    const almostDone = reading
      .filter((i) => progress(i) >= 0.75 && progress(i) < 1)
      .sort((a, b) => progress(b) - progress(a));
    if (almostDone.length >= 2) {
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
    if (recent.length >= 3) {
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
      shelves.push({
        id: "favorites",
        emoji: "⭐",
        title: "Seus favoritos",
        subtitle: "Os que você mais amou",
        items: favorites
          .slice()
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
          .slice(0, 20),
        priority: 5,
      });
    }

    // ─── 7. Quero ler ────────────────────────────────────────
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

    // ─── 8. No acervo ────────────────────────────────────────
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

    // ─── 9. Lançamentos (últimos 3 anos) ─────────────────────
    const currentYear = new Date().getFullYear();
    const recentReleases = items
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
        priority: 8,
      });
    }

    // ─── 10. Clássicos (publicados antes de 1970) ────────────
    const classics = items
      .filter((i) => {
        const y = i.book?.published_year;
        return y && y > 0 && y < 1970;
      })
      .sort(
        (a, b) =>
          (a.book?.published_year ?? 0) - (b.book?.published_year ?? 0),
      );
    if (classics.length >= 3) {
      shelves.push({
        id: "classics",
        emoji: "🏛️",
        title: "Clássicos da sua estante",
        subtitle: "Publicados antes de 1970",
        items: classics.slice(0, 20),
        priority: 9,
      });
    }

    // ─── 11. Por tipo de conteúdo (mangá, quadrinhos, revistas) ─
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
    [...byType.entries()].forEach(([type, list], idx) => {
      if (list.length < 3) return;
      const meta = TYPE_META[type] ?? { title: type, emoji: "📚" };
      shelves.push({
        id: `type-${type}`,
        emoji: meta.emoji,
        title: meta.title,
        subtitle: `${list.length} ${list.length === 1 ? "título" : "títulos"} na coleção`,
        items: list.slice(0, 20),
        priority: 11 + idx,
      });
    });

    // ─── 12. Por gênero (top 5) ──────────────────────────────
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
      .filter(([, list]) => list.length >= 3)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5);
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

    // ─── 13. Por autor (top 4 com >= 2 livros) ───────────────
    const authorCount = new Map<string, UserBook[]>();
    for (const i of items) {
      const a = i.book?.authors?.[0];
      if (!a) continue;
      const list = authorCount.get(a) ?? [];
      list.push(i);
      authorCount.set(a, list);
    }
    const topAuthors = [...authorCount.entries()]
      .filter(([, list]) => list.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 4);
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

    // ─── 14. Por década ──────────────────────────────────────
    const decadeCount = new Map<number, UserBook[]>();
    for (const i of items) {
      const y = i.book?.published_year;
      if (!y || y < 1900) continue;
      const dec = Math.floor(y / 10) * 10;
      const list = decadeCount.get(dec) ?? [];
      list.push(i);
      decadeCount.set(dec, list);
    }
    const topDecades = [...decadeCount.entries()]
      .filter(([, list]) => list.length >= 3)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3);
    topDecades.forEach(([dec, list], idx) => {
      shelves.push({
        id: `decade-${dec}`,
        emoji: "📅",
        title: `Anos ${String(dec).slice(-2)}`,
        subtitle: `Publicados na década de ${dec}`,
        items: list
          .slice()
          .sort(
            (a, b) =>
              (a.book?.published_year ?? 0) - (b.book?.published_year ?? 0),
          )
          .slice(0, 20),
        priority: 40 + idx,
      });
    });

    // ─── 15. Por editora (top 1 com >= 4 livros) ─────────────
    const pubCount = new Map<string, UserBook[]>();
    for (const i of items) {
      const p = i.book?.publisher;
      if (!p) continue;
      const list = pubCount.get(p) ?? [];
      list.push(i);
      pubCount.set(p, list);
    }
    const topPub = [...pubCount.entries()]
      .filter(([, list]) => list.length >= 4)
      .sort((a, b) => b[1].length - a[1].length)[0];
    if (topPub) {
      const [pub, list] = topPub;
      shelves.push({
        id: `pub-${pub}`,
        emoji: "🏢",
        title: `Selo ${pub}`,
        subtitle: `${list.length} títulos dessa editora`,
        items: list.slice(0, 20),
        priority: 45,
      });
    }

    // ─── 16. Por idioma (se há mais de um) ───────────────────
    const langCount = new Map<string, UserBook[]>();
    for (const i of items) {
      const l = i.book?.language;
      if (!l) continue;
      const list = langCount.get(l) ?? [];
      list.push(i);
      langCount.set(l, list);
    }
    if (langCount.size > 1) {
      const LANG_LABEL: Record<string, string> = {
        pt: "em Português", "pt-BR": "em Português",
        en: "em Inglês", es: "em Espanhol",
        fr: "em Francês", ja: "em Japonês", de: "em Alemão", it: "em Italiano",
      };
      [...langCount.entries()]
        .filter(([, list]) => list.length >= 3)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 2)
        .forEach(([lang, list], idx) => {
          const label = LANG_LABEL[lang] ?? `em ${lang.toUpperCase()}`;
          shelves.push({
            id: `lang-${lang}`,
            emoji: "🌐",
            title: `Leituras ${label}`,
            subtitle: `${list.length} ${list.length === 1 ? "título" : "títulos"}`,
            items: list.slice(0, 20),
            priority: 50 + idx,
          });
        });
    }

    // ─── 17. Livros curtos (< 200 pág) ───────────────────────
    const shortBooks = items
      .filter((i) => {
        const p = i.book?.page_count ?? 0;
        return p > 0 && p < 200 && i.status !== "read";
      })
      .sort((a, b) => (a.book?.page_count ?? 0) - (b.book?.page_count ?? 0));
    if (shortBooks.length >= 3) {
      shelves.push({
        id: "short",
        emoji: "⚡",
        title: "Leituras rápidas",
        subtitle: "Menos de 200 páginas",
        items: shortBooks.slice(0, 20),
        priority: 55,
      });
    }

    // ─── 18. Leituras longas (> 500 pág) ─────────────────────
    const longBooks = items
      .filter((i) => {
        const p = i.book?.page_count ?? 0;
        return p > 500 && i.status !== "read";
      })
      .sort((a, b) => (b.book?.page_count ?? 0) - (a.book?.page_count ?? 0));
    if (longBooks.length >= 3) {
      shelves.push({
        id: "long",
        emoji: "🧗",
        title: "Para encarar com calma",
        subtitle: "Mais de 500 páginas",
        items: longBooks.slice(0, 20),
        priority: 56,
      });
    }

    // ─── 19. Releitura recomendada (lidos há > 6 meses, 4-5★) ─
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
        priority: 60,
      });
    }

    // ─── 20. Porque você leu X (último 4-5★) ─────────────────
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
      if (related.length >= 3) {
        shelves.push({
          id: `because-${lastFav.id}`,
          emoji: "💡",
          title: `Porque você leu ${lastFav.book.title}`,
          subtitle: "Mais como esse na sua biblioteca",
          items: related.slice(0, 20),
          priority: 70,
        });
      }
    }

    return shelves.sort((a, b) => a.priority - b.priority);
  }, [items]);
}
