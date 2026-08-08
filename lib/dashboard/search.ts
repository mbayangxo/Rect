import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { isProfilePublic } from "@/lib/dashboard/privacy";
import { isDemoTrack, isPublishedTrack, trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

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

type ArtistRow = {
  id: string;
  display_name: string | null;
  genres?: unknown;
  privacy_public_profile?: boolean | null;
};

/** Strip PostgREST filter metacharacters from user input. */
function sanitizeFilter(raw: string) {
  return raw.replace(/[%_,.()"'\\]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Search tracks + artists in Supabase.
 * Empty query returns recent tracks / artists (browse mode).
 * Honors privacy_public_profile for artist discovery.
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

    const rows = ((trackRows ?? []) as TrackRow[]).filter(
      (t) => isPublishedTrack(t) && !isDemoTrack(t),
    );
    const artistIds = [
      ...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[]),
    ];
    const nameById = await loadArtistCreditMap(db, artistIds);

    let tracks: SearchTrack[] = rows.map((r) => ({
      ...r,
      artist_name: r.artist_id ? (nameById.get(r.artist_id) ?? null) : null,
    }));

    if (query) {
      const fullMatch = await db
        .from("users")
        .select(
          "id, display_name, genres, account_type, role, privacy_public_profile",
        )
        .or("account_type.eq.artist,role.eq.artist")
        .ilike("display_name", `%${query}%`)
        .limit(20);

      let matched: ArtistRow[] = [];
      if (
        fullMatch.error &&
        /privacy_public_profile|column .* does not exist/i.test(
          fullMatch.error.message,
        )
      ) {
        const lean = await db
          .from("users")
          .select("id, display_name, genres, account_type, role")
          .or("account_type.eq.artist,role.eq.artist")
          .ilike("display_name", `%${query}%`)
          .limit(20);
        matched = (lean.data ?? []) as ArtistRow[];
      } else if (!fullMatch.error) {
        matched = ((fullMatch.data ?? []) as ArtistRow[]).filter((a) =>
          isProfilePublic({
            privacy_public_profile: a.privacy_public_profile ?? true,
          }),
        );
      }

      const extraIds = matched
        .map((a) => a.id)
        .filter((id) => !artistIds.includes(id));

      if (extraIds.length > 0) {
        const { data: moreTracks } = await db
          .from("tracks")
          .select(
            "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
          )
          .in("artist_id", extraIds)
          .limit(30);
        const extraNames = await loadArtistCreditMap(db, extraIds);
        for (const [id, name] of extraNames) nameById.set(id, name);
        const extra = ((moreTracks ?? []) as TrackRow[])
          .filter((t) => isPublishedTrack(t) && !isDemoTrack(t))
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

    if (query) {
      const q = query.toLowerCase();
      tracks = tracks.filter(
        (t) =>
          trackTitle(t).toLowerCase().includes(q) ||
          (t.genre || "").toLowerCase().includes(q) ||
          trackArtist(t).toLowerCase().includes(q),
      );
    }

    const listFull = query
      ? await db
          .from("users")
          .select(
            "id, display_name, genres, account_type, role, created_at, privacy_public_profile",
          )
          .or("account_type.eq.artist,role.eq.artist")
          .ilike("display_name", `%${query}%`)
          .order("created_at", { ascending: false })
          .limit(24)
      : await db
          .from("users")
          .select(
            "id, display_name, genres, account_type, role, created_at, privacy_public_profile",
          )
          .or("account_type.eq.artist,role.eq.artist")
          .order("created_at", { ascending: false })
          .limit(24);

    let artistRows: ArtistRow[] = [];
    if (
      listFull.error &&
      /privacy_public_profile|column .* does not exist/i.test(
        listFull.error.message,
      )
    ) {
      const lean = query
        ? await db
            .from("users")
            .select("id, display_name, genres, account_type, role, created_at")
            .or("account_type.eq.artist,role.eq.artist")
            .ilike("display_name", `%${query}%`)
            .order("created_at", { ascending: false })
            .limit(24)
        : await db
            .from("users")
            .select("id, display_name, genres, account_type, role, created_at")
            .or("account_type.eq.artist,role.eq.artist")
            .order("created_at", { ascending: false })
            .limit(24);
      if (lean.error) {
        return {
          ok: true,
          query,
          tracks: tracks.slice(0, 30),
          artists: [],
          error: null,
        };
      }
      artistRows = (lean.data ?? []) as ArtistRow[];
    } else if (listFull.error) {
      return {
        ok: true,
        query,
        tracks: tracks.slice(0, 30),
        artists: [],
        error: null,
      };
    } else {
      artistRows = (listFull.data ?? []) as ArtistRow[];
    }

    const artists: SearchArtist[] = artistRows
      .filter((a) =>
        isProfilePublic({
          privacy_public_profile: a.privacy_public_profile ?? true,
        }),
      )
      .map((a) => {
        const genres = Array.isArray(a.genres)
          ? a.genres.filter((g): g is string => typeof g === "string")
          : [];
        return {
          id: a.id,
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
