// AniList GraphQL — busca de mangás (gratuito, sem API key)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANILIST_URL = "https://graphql.anilist.co";

const SEARCH_QUERY = `
query ($search: String, $perPage: Int) {
  Page(perPage: $perPage) {
    media(search: $search, type: MANGA, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
      id
      title { romaji english native }
      description(asHtml: false)
      coverImage { large extraLarge }
      bannerImage
      genres
      startDate { year }
      endDate { year }
      status
      volumes
      chapters
      averageScore
      staff(perPage: 4) {
        edges { role node { name { full } } }
      }
    }
  }
}`;

interface AnilistMedia {
  id: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  description: string | null;
  coverImage: { large: string | null; extraLarge: string | null };
  bannerImage: string | null;
  genres: string[];
  startDate: { year: number | null };
  endDate: { year: number | null };
  status: string | null;
  volumes: number | null;
  chapters: number | null;
  averageScore: number | null;
  staff: { edges: { role: string; node: { name: { full: string } } }[] };
}

function bestTitle(m: AnilistMedia): string {
  return m.title.english || m.title.romaji || m.title.native || "Sem título";
}

function authorsFromStaff(m: AnilistMedia): string[] {
  // Story & Art / Story / Art / Original Creator
  const wanted = /story|art|creator|author/i;
  return [
    ...new Set(
      m.staff.edges
        .filter((e) => wanted.test(e.role))
        .map((e) => e.node.name.full)
        .filter(Boolean),
    ),
  ].slice(0, 3);
}

function statusMap(s: string | null): string | null {
  switch (s) {
    case "FINISHED": return "finished";
    case "RELEASING": return "ongoing";
    case "HIATUS": return "hiatus";
    case "CANCELLED": return "cancelled";
    case "NOT_YET_RELEASED": return "upcoming";
    default: return null;
  }
}

function toBookShape(m: AnilistMedia) {
  const title = bestTitle(m);
  const authors = authorsFromStaff(m);
  const description = m.description
    ? m.description.replace(/<[^>]*>/g, "").trim()
    : null;
  return {
    // Não tem id no banco ainda — frontend usa ext_<source_id>
    id: `ext_anilist_${m.id}`,
    title,
    subtitle: m.title.native && m.title.native !== title ? m.title.native : null,
    authors,
    cover_url: m.coverImage.extraLarge || m.coverImage.large || null,
    description,
    categories: m.genres || [],
    published_year: m.startDate.year,
    source: "anilist",
    source_id: String(m.id),
    content_type: "manga" as const,
    // Campos extras (vão pro raw do book quando salvo)
    _series: {
      total_volumes: m.volumes,
      total_chapters: m.chapters,
      status: statusMap(m.status),
      banner_url: m.bannerImage,
      score: m.averageScore,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const perPage = Math.min(Number(url.searchParams.get("limit") || 20), 30);

    if (!q || q.length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { search: q, perPage },
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "Muitas buscas. Tente em alguns segundos.", results: [] }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      const txt = await r.text();
      console.error("AniList error", r.status, txt);
      return new Response(JSON.stringify({ error: "AniList indisponível", results: [] }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const j = await r.json();
    const media: AnilistMedia[] = j?.data?.Page?.media || [];
    const results = media.map(toBookShape);

    return new Response(JSON.stringify({ results }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // Cache leve (CDN/browser): 1h
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    console.error("anilist-search error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro", results: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
