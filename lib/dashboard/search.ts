import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoTrack, trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

export type SearchTrack = TrackRow & {
  artist_name: string | null;
};

export type SearchArtist = {
  id: string;
  display_name: string;
  genre: string | null;
};

export type SearchResult = {
  ok: boolean;
  query: string;
  tracks: SearchTrack[];
  artists: SearchArtist[];
  error: string | null;
};

/** Strip PostgREST filter metacharacters from user input. */
function sanitizeFilter(raw: string) {
  return raw.replace(/[%_,.()"'\\]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Search tracks + artists in Supabase.
 * Empty query returns recent tracks / artists (browse mode).
 */
export async function searchCatalog(
  supabase: SupabaseClient,
  rawQuery: string,
): Promise<SearchResult> {
  const query = sanitizeFilter(rawQuery);
  const admin = createAdminClient();
  const db = admin ?? supabase;

  try {
    let trackQuery = db
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(40);

    if (query) {
      trackQuery = trackQuery.or(
        `title.ilike.%${query}%,genre.ilike.%${query}%`,
      );
    }

    const { data: trackRows, error: trackError } = await trackQuery;
    if (trackError) {
      return {
        ok: false,
        query,
        tracks: [],
        artists: [],
        error: trackError.message,
      };
    }

    const rows = ((trackRows ?? []) as TrackRow[]).filter((t) => !isDemoTrack(t));
    const artistIds = [
      ...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[]),
    ];
    const nameById = new Map<string, string>();

    if (artistIds.length > 0) {
      const { data: named } = await db
        .from("users")
        .select("id, display_name")
        .in("id", artistIds);
      for (const a of named ?? []) {
        if (a.display_name) nameById.set(a.id, a.display_name);
      }
    }

    let tracks: SearchTrack[] = rows.map((r) => ({
      ...r,
      artist_name: r.artist_id ? (nameById.get(r.artist_id) ?? null) : null,
    }));

    // If query matches artist names, also pull their tracks
    if (query) {
      const { data: matchedArtists } = await db
        .from("users")
        .select("id, display_name, genres, account_type, role")
        .or("account_type.eq.artist,role.eq.artist")
        .ilike("display_name", `%${query}%`)
        .limit(20);

      const extraIds = (matchedArtists ?? [])
        .map((a) => a.id as string)
        .filter((id) => !artistIds.includes(id));

      if (extraIds.length > 0) {
        const { data: moreTracks } = await db
          .from("tracks")
          .select(
            "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
          )
          .in("artist_id", extraIds)
          .limit(30);
        for (const a of matchedArtists ?? []) {
          if (a.display_name) nameById.set(a.id, a.display_name);
        }
        const extra = ((moreTracks ?? []) as TrackRow[])
          .filter((t) => !isDemoTrack(t))
          .map((r) => ({
            ...r,
            artist_name: r.artist_id
              ? (nameById.get(r.artist_id) ?? null)
              : null,
          }));
        const seen = new Set(tracks.map((t) => t.id));
        for (const t of extra) {
          if (!seen.has(t.id)) tracks.push(t);
        }
      }
    }

    // Filter by artist name client-side too (ilike on join not available)
    if (query) {
      const q = query.toLowerCase();
      tracks = tracks.filter(
        (t) =>
          trackTitle(t).toLowerCase().includes(q) ||
          (t.genre || "").toLowerCase().includes(q) ||
          trackArtist(t).toLowerCase().includes(q),
      );
    }

    let artistQuery = db
      .from("users")
      .select("id, display_name, genres, account_type, role, created_at")
      .or("account_type.eq.artist,role.eq.artist")
      .order("created_at", { ascending: false })
      .limit(24);

    if (query) {
      artistQuery = artistQuery.ilike("display_name", `%${query}%`);
    }

    const { data: artistRows, error: artistError } = await artistQuery;
    if (artistError) {
      return {
        ok: true,
        query,
        tracks: tracks.slice(0, 30),
        artists: [],
        error: null,
      };
    }

    const artists: SearchArtist[] = (artistRows ?? []).map((a) => {
      const genres = Array.isArray(a.genres)
        ? a.genres.filter((g): g is string => typeof g === "string")
        : [];
      return {
        id: a.id as string,
        display_name:
          (typeof a.display_name === "string" && a.display_name.trim()) ||
          "Artist",
        genre: genres[0] ?? null,
      };
    });

    return {
      ok: true,
      query,
      tracks: tracks.slice(0, 30),
      artists,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      query,
      tracks: [],
      artists: [],
      error: e instanceof Error ? e.message : "Search failed",
    };
  }
}
