import type { SupabaseClient } from "@supabase/supabase-js";
import { CULTURAL_GENRES } from "@/lib/cultural-options";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { loadLikeCountMap } from "@/lib/dashboard/likes";
import type { ListenerTaste } from "@/lib/dashboard/taste";
import {
  isDemoTrack,
  isPublishedTrack,
  withLiveCatalogTracks,
  type TrackRow,
} from "@/lib/tracks";

export type GenreHub = {
  slug: string;
  name: string;
  track_count: number;
  for_you: boolean;
};

export type GenreTrack = TrackRow & {
  artist_name: string | null;
  like_count: number;
};

function normalizeGenreName(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

export function genreToSlug(name: string) {
  return normalizeGenreName(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function genresMatch(a: string, b: string) {
  return genreToSlug(a) === genreToSlug(b);
}

/**
 * Resolve ?genre= from slug or display name to a canonical label.
 */
export function resolveGenreParam(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  const slug = genreToSlug(t);
  if (!slug) return null;

  // Prefer catalog spelling when it matches a known cultural genre
  for (const name of CULTURAL_GENRES) {
    if (genreToSlug(name) === slug) return name;
  }

  // Title-case from slug when input was a slug.
  if (t.includes("-") || t === slug) {
    return slug
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return normalizeGenreName(t);
}

export function trackMatchesGenre(
  trackGenre: string | null | undefined,
  filter: string | null | undefined,
) {
  if (!filter) return true;
  if (!trackGenre) return false;
  return genresMatch(trackGenre, filter);
}

/**
 * Genre hubs from published catalog tracks.
 */
export async function loadGenreHubs(
  supabase: SupabaseClient,
  taste?: ListenerTaste | null,
): Promise<{ hubs: GenreHub[]; error: string | null }> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data, error } = await withLiveCatalogTracks(
      db.from("tracks").select("id, title, genre, status"),
    )
      .order("created_at", { ascending: false })
      .limit(400);

    if (error) {
      return { hubs: [], error: error.message };
    }

    const rows = ((data ?? []) as TrackRow[]).filter(
      (t) => isPublishedTrack(t) && !isDemoTrack(t),
    );

    const counts = new Map<string, { name: string; count: number }>();
    for (const t of rows) {
      const name = typeof t.genre === "string" ? normalizeGenreName(t.genre) : "";
      if (!name) continue;
      const slug = genreToSlug(name);
      if (!slug) continue;
      const prev = counts.get(slug);
      if (prev) {
        prev.count += 1;
      } else {
        counts.set(slug, { name, count: 1 });
      }
    }

    const tasteSlugs = new Set(
      (taste?.genres ?? []).map((g) => genreToSlug(g)).filter(Boolean),
    );

    const hubs: GenreHub[] = [...counts.entries()]
      .map(([slug, v]) => ({
        slug,
        name: v.name,
        track_count: v.count,
        for_you: tasteSlugs.has(slug),
      }))
      .sort(
        (a, b) =>
          Number(b.for_you) - Number(a.for_you) ||
          b.track_count - a.track_count ||
          a.name.localeCompare(b.name),
      );

    return { hubs, error: null };
  } catch (e) {
    return {
      hubs: [],
      error: e instanceof Error ? e.message : "Failed to load genres",
    };
  }
}

export async function loadGenreTracks(
  supabase: SupabaseClient,
  slug: string,
  limit = 40,
): Promise<{
  genreName: string | null;
  tracks: GenreTrack[];
  error: string | null;
  notFound: boolean;
}> {
  const cleanSlug = genreToSlug(slug);
  if (!cleanSlug) {
    return { genreName: null, tracks: [], error: null, notFound: true };
  }

  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data, error } = await withLiveCatalogTracks(
      db
        .from("tracks")
        .select(
          "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
        ),
    )
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      return {
        genreName: null,
        tracks: [],
        error: error.message,
        notFound: false,
      };
    }

    const matched = ((data ?? []) as TrackRow[]).filter((t) => {
      if (!isPublishedTrack(t) || isDemoTrack(t)) return false;
      const g = typeof t.genre === "string" ? t.genre : "";
      return genresMatch(g, cleanSlug);
    });

    if (matched.length === 0) {
      return {
        genreName: null,
        tracks: [],
        error: null,
        notFound: true,
      };
    }

    const genreName =
      normalizeGenreName(matched[0].genre || cleanSlug) || cleanSlug;

    const sliced = matched.slice(0, limit);
    const artistIds = [
      ...new Set(sliced.map((t) => t.artist_id).filter(Boolean) as string[]),
    ];
    const nameById = await loadArtistCreditMap(db, artistIds);
    const likes = await loadLikeCountMap(
      db,
      sliced.map((t) => t.id),
    );

    const tracks: GenreTrack[] = sliced.map((t) => ({
      ...t,
      artist_name: t.artist_id
        ? (nameById.get(t.artist_id) ?? null)
        : null,
      like_count: likes.get(t.id) ?? 0,
    }));

    return { genreName, tracks, error: null, notFound: false };
  } catch (e) {
    return {
      genreName: null,
      tracks: [],
      error: e instanceof Error ? e.message : "Failed to load genre",
      notFound: false,
    };
  }
}
