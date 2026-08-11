import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBlockedEitherIds } from "@/lib/dashboard/blocks";
import { artistMatchesPlaces } from "@/lib/dashboard/charts";
import { trackMatchesGenre } from "@/lib/dashboard/genres";
import { trackMatchesLanguage } from "@/lib/dashboard/languages";
import { placesMatch } from "@/lib/dashboard/places";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { isProfilePublic } from "@/lib/dashboard/privacy";
import { normalizeTasteList } from "@/lib/dashboard/taste";
import {
  isDemoTrack,
  isPublishedTrack,
  trackArtist,
  trackTitle,
  withLiveCatalogTracks,
  type TrackRow,
} from "@/lib/tracks";

export type SearchTrack = TrackRow & {
  artist_name: string | null;
};

export type SearchArtist = {
  id: string;
  display_name: string;
  genre: string | null;
  avatar_url: string | null;
};

export type SearchPlaylist = {
  id: string;
  name: string;
  description: string | null;
  cover_art_url: string | null;
  owner_name: string | null;
  track_count: number;
};

export type SearchPerson = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  place: string | null;
};

export type SearchResult = {
  ok: boolean;
  query: string;
  tracks: SearchTrack[];
  artists: SearchArtist[];
  playlists: SearchPlaylist[];
  people: SearchPerson[];
  error: string | null;
};

type ArtistRow = {
  id: string;
  display_name: string | null;
  genres?: unknown;
  countries?: unknown;
  avatar_url?: string | null;
  privacy_public_profile?: boolean | null;
};

/** Strip PostgREST filter metacharacters from user input. */
function sanitizeFilter(raw: string) {
  return raw.replace(/[%_,.()"'\\]/g, " ").replace(/\s+/g, " ").trim();
}

async function loadArtistCountriesMap(
  db: SupabaseClient,
  artistIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (artistIds.length === 0) return map;

  const { data, error } = await db
    .from("users")
    .select("id, countries")
    .in("id", artistIds);

  if (error || !data) return map;
  for (const row of data) {
    map.set(row.id as string, normalizeTasteList(row.countries));
  }
  return map;
}

/**
 * Search tracks + artists + public playlists + public listeners in Supabase.
 * Empty query returns recent tracks / artists / public mixes / people (browse).
 * Honors privacy_public_profile for discovery.
 */
export async function searchCatalog(
  supabase: SupabaseClient,
  rawQuery: string,
  opts?: {
    viewerId?: string | null;
    language?: string | null;
    genre?: string | null;
    place?: string | null;
  },
): Promise<SearchResult> {
  const query = sanitizeFilter(rawQuery);
  const admin = createAdminClient();
  const db = admin ?? supabase;
  const viewerId = opts?.viewerId ?? null;
  const languageFilter = opts?.language?.trim() || null;
  const genreFilter = opts?.genre?.trim() || null;
  const placeFilter = opts?.place?.trim() || null;

  try {
    let trackQuery = withLiveCatalogTracks(
      db
        .from("tracks")
        .select(
          "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at",
        ),
    )
      .order("created_at", { ascending: false })
      .limit(40);

    if (query) {
      trackQuery = trackQuery.or(
        `title.ilike.%${query}%,genre.ilike.%${query}%,language.ilike.%${query}%`,
      );
    }

    let { data: trackRows, error: trackError } = await trackQuery;
    if (
      trackError &&
      /language|column .* does not exist/i.test(trackError.message)
    ) {
      let fallback = withLiveCatalogTracks(
        db
          .from("tracks")
          .select(
            "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
          ),
      )
        .order("created_at", { ascending: false })
        .limit(40);
      if (query) {
        fallback = fallback.or(
          `title.ilike.%${query}%,genre.ilike.%${query}%`,
        );
      }
      const retry = await fallback;
      trackRows = retry.data;
      trackError = retry.error;
    }
    if (trackError) {
      return {
        ok: false,
        query,
        tracks: [],
        artists: [],
        playlists: [],
        people: [],
        error: trackError.message,
      };
    }

    const rows = ((trackRows ?? []) as TrackRow[]).filter(
      (t) =>
        isPublishedTrack(t) &&
        !isDemoTrack(t) &&
        trackMatchesLanguage(t.language, languageFilter) &&
        trackMatchesGenre(t.genre, genreFilter),
    );
    let artistIds = [
      ...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[]),
    ];
    const countriesByArtist = placeFilter
      ? await loadArtistCountriesMap(db, artistIds)
      : new Map<string, string[]>();

    const placeFiltered = placeFilter
      ? rows.filter((t) => {
          if (!t.artist_id) return false;
          return artistMatchesPlaces(
            countriesByArtist.get(t.artist_id) ?? [],
            [placeFilter],
          );
        })
      : rows;

    artistIds = [
      ...new Set(
        placeFiltered.map((r) => r.artist_id).filter(Boolean) as string[],
      ),
    ];
    const nameById = await loadArtistCreditMap(db, artistIds);

    let tracks: SearchTrack[] = placeFiltered.map((r) => ({
      ...r,
      artist_name: r.artist_id ? (nameById.get(r.artist_id) ?? null) : null,
    }));

    if (query) {
      const fullMatch = await db
        .from("users")
        .select(
          "id, display_name, genres, avatar_url, account_type, role, privacy_public_profile",
        )
        .or("account_type.eq.artist,role.eq.artist")
        .ilike("display_name", `%${query}%`)
        .limit(20);

      let matched: ArtistRow[] = [];
      if (
        fullMatch.error &&
        /privacy_public_profile|avatar_url|column .* does not exist/i.test(
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
        const { data: moreTracks } = await withLiveCatalogTracks(
          db
            .from("tracks")
            .select(
              "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at",
            )
            .in("artist_id", extraIds),
        ).limit(30);
        const [extraNames, extraCountries] = await Promise.all([
          loadArtistCreditMap(db, extraIds),
          placeFilter
            ? loadArtistCountriesMap(db, extraIds)
            : Promise.resolve(new Map<string, string[]>()),
        ]);
        for (const [id, name] of extraNames) nameById.set(id, name);
        for (const [id, countries] of extraCountries) {
          countriesByArtist.set(id, countries);
        }
        const extra = ((moreTracks ?? []) as TrackRow[])
          .filter(
            (t) =>
              isPublishedTrack(t) &&
              !isDemoTrack(t) &&
              trackMatchesLanguage(t.language, languageFilter) &&
              trackMatchesGenre(t.genre, genreFilter) &&
              (!placeFilter ||
                (t.artist_id != null &&
                  artistMatchesPlaces(
                    countriesByArtist.get(t.artist_id) ?? [],
                    [placeFilter],
                  ))),
          )
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
          (t.language || "").toLowerCase().includes(q) ||
          trackArtist(t).toLowerCase().includes(q),
      );
    }

    const listFull = query
      ? await db
          .from("users")
          .select(
            "id, display_name, genres, avatar_url, account_type, role, created_at, privacy_public_profile",
          )
          .or("account_type.eq.artist,role.eq.artist")
          .ilike("display_name", `%${query}%`)
          .order("created_at", { ascending: false })
          .limit(24)
      : await db
          .from("users")
          .select(
            "id, display_name, genres, avatar_url, account_type, role, created_at, privacy_public_profile",
          )
          .or("account_type.eq.artist,role.eq.artist")
          .order("created_at", { ascending: false })
          .limit(24);

    let artistRows: ArtistRow[] = [];
    if (
      listFull.error &&
      /privacy_public_profile|avatar_url|column .* does not exist/i.test(
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
        const playlists = await searchPublicPlaylists(db, query);
        return {
          ok: true,
          query,
          tracks: tracks.slice(0, 30),
          artists: [],
          playlists,
          people: [],
          error: null,
        };
      }
      artistRows = (lean.data ?? []) as ArtistRow[];
    } else if (listFull.error) {
      const playlists = await searchPublicPlaylists(db, query);
      return {
        ok: true,
        query,
        tracks: tracks.slice(0, 30),
        artists: [],
        playlists,
        people: [],
        error: null,
      };
    } else {
      artistRows = (listFull.data ?? []) as ArtistRow[];
    }

    let artists: SearchArtist[] = artistRows
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
          avatar_url:
            typeof a.avatar_url === "string" && a.avatar_url.trim()
              ? a.avatar_url.trim()
              : null,
        };
      });

    if (placeFilter && artists.length > 0) {
      const artistCountryMap = await loadArtistCountriesMap(
        db,
        artists.map((a) => a.id),
      );
      artists = artists.filter((a) =>
        artistMatchesPlaces(artistCountryMap.get(a.id) ?? [], [placeFilter]),
      );
    }

    const [playlists, peopleRaw] = await Promise.all([
      searchPublicPlaylists(db, query),
      searchPublicPeople(db, query),
    ]);

    let people = peopleRaw;
    if (placeFilter) {
      people = people.filter(
        (p) => p.place != null && placesMatch(p.place, placeFilter),
      );
    }
    if (viewerId && people.length > 0) {
      const blocked = await loadBlockedEitherIds(supabase, viewerId);
      if (!blocked.missingTable && blocked.ids.length > 0) {
        const hide = new Set(blocked.ids);
        people = people.filter((p) => !hide.has(p.id));
      }
    }

    return {
      ok: true,
      query,
      tracks: tracks.slice(0, 30),
      artists,
      playlists,
      people,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      query,
      tracks: [],
      artists: [],
      playlists: [],
      people: [],
      error: e instanceof Error ? e.message : "Search failed",
    };
  }
}


async function searchPublicPeople(
  db: SupabaseClient,
  query: string,
): Promise<SearchPerson[]> {
  try {
    const select =
      "id, display_name, countries, avatar_url, account_type, role, privacy_public_profile, created_at";

    let q = db
      .from("users")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(40);

    if (query) {
      q = q.ilike("display_name", `%${query}%`);
    }

    let data: Record<string, unknown>[] | null = null;
    let error: { message: string } | null = null;

    const primary = await q;
    data = (primary.data ?? null) as Record<string, unknown>[] | null;
    error = primary.error;

    if (
      error &&
      /avatar_url|countries|privacy_public_profile|column .* does not exist/i.test(
        error.message,
      )
    ) {
      let lean = db
        .from("users")
        .select(
          "id, display_name, account_type, role, privacy_public_profile, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(40);
      if (query) {
        lean = lean.ilike("display_name", `%${query}%`);
      }
      const retry = await lean;
      if (
        retry.error &&
        /privacy_public_profile|column .* does not exist/i.test(
          retry.error.message,
        )
      ) {
        let bare = db
          .from("users")
          .select("id, display_name, account_type, role, created_at")
          .order("created_at", { ascending: false })
          .limit(40);
        if (query) {
          bare = bare.ilike("display_name", `%${query}%`);
        }
        const again = await bare;
        if (again.error) return [];
        data = (again.data ?? null) as Record<string, unknown>[] | null;
        error = null;
      } else if (retry.error) {
        return [];
      } else {
        data = (retry.data ?? null) as Record<string, unknown>[] | null;
        error = null;
      }
    }

    if (error || !data) return [];

    const people: SearchPerson[] = [];
    for (const row of data) {
      const isArtist =
        row.account_type === "artist" || row.role === "artist";
      if (isArtist) continue;
      if (
        !isProfilePublic({
          privacy_public_profile:
            (row.privacy_public_profile as boolean | null | undefined) ?? true,
        })
      ) {
        continue;
      }
      const name =
        typeof row.display_name === "string" && row.display_name.trim()
          ? row.display_name.trim()
          : null;
      if (!name) continue;
      const countries = Array.isArray(row.countries)
        ? row.countries.filter((c): c is string => typeof c === "string")
        : [];
      people.push({
        id: row.id as string,
        display_name: name,
        avatar_url:
          typeof row.avatar_url === "string" && row.avatar_url.trim()
            ? row.avatar_url.trim()
            : null,
        place: countries[0] ?? null,
      });
      if (people.length >= 16) break;
    }
    return people;
  } catch {
    return [];
  }
}

async function searchPublicPlaylists(
  db: SupabaseClient,
  query: string,
): Promise<SearchPlaylist[]> {
  try {
    let q = db
      .from("playlists")
      .select("id, name, description, cover_art_url, user_id, updated_at")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .limit(24);

    if (query) {
      q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
    }

    const { data, error } = await q;
    if (error) {
      return [];
    }

    const rows = data ?? [];
    if (rows.length === 0) return [];

    const ownerIds = [
      ...new Set(
        rows
          .map((r) => r.user_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const ownerNames = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: owners } = await db
        .from("users")
        .select("id, display_name")
        .in("id", ownerIds);
      for (const o of owners ?? []) {
        const name =
          typeof o.display_name === "string" && o.display_name.trim()
            ? o.display_name.trim()
            : null;
        if (name) ownerNames.set(o.id as string, name);
      }
    }

    const ids = rows.map((r) => r.id as string);
    const countById = new Map<string, number>();
    const { data: links } = await db
      .from("playlist_tracks")
      .select("playlist_id")
      .in("playlist_id", ids);
    for (const link of links ?? []) {
      const pid = link.playlist_id as string;
      countById.set(pid, (countById.get(pid) ?? 0) + 1);
    }

    return rows
      .map((r) => {
        const desc =
          typeof r.description === "string" && r.description.trim()
            ? r.description.trim()
            : null;
        const cover =
          typeof r.cover_art_url === "string" && r.cover_art_url.trim()
            ? r.cover_art_url.trim()
            : null;
        const uid = r.user_id as string | null;
        return {
          id: r.id as string,
          name: (typeof r.name === "string" && r.name.trim()) || "Playlist",
          description: desc,
          cover_art_url: cover,
          owner_name: uid ? (ownerNames.get(uid) ?? null) : null,
          track_count: countById.get(r.id as string) ?? 0,
        };
      })
      .filter((p) => p.track_count > 0);
  } catch {
    return [];
  }
}
