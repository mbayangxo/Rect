import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { loadLikeCountMap } from "@/lib/dashboard/likes";
import { isProfilePublic } from "@/lib/dashboard/privacy";
import { normalizeTasteList, type ListenerTaste } from "@/lib/dashboard/taste";
import {
  isDemoTrack,
  isPublishedTrack,
  type TrackRow,
} from "@/lib/tracks";

export type PlaceHub = {
  slug: string;
  name: string;
  artist_count: number;
  track_count: number;
  for_you: boolean;
};

export type PlaceArtist = {
  id: string;
  display_name: string;
};

export type PlaceTrack = TrackRow & {
  artist_name: string | null;
  like_count: number;
};

function normalizePlaceName(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

export function placeToSlug(name: string) {
  return normalizePlaceName(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function placesMatch(a: string, b: string) {
  return placeToSlug(a) === placeToSlug(b);
}

type ArtistPlaceRow = {
  id: string;
  display_name: string | null;
  countries?: unknown;
  account_type?: string | null;
  role?: string | null;
  privacy_public_profile?: boolean | null;
};

function isArtistRow(row: ArtistPlaceRow) {
  return row.account_type === "artist" || row.role === "artist";
}

async function loadPublicArtists(
  db: SupabaseClient,
): Promise<{ artists: ArtistPlaceRow[]; error: string | null }> {
  const select =
    "id, display_name, countries, account_type, role, privacy_public_profile";

  const primary = await db
    .from("users")
    .select(select)
    .eq("account_type", "artist")
    .limit(200);

  if (
    primary.error &&
    /privacy_public_profile|countries|column .* does not exist/i.test(
      primary.error.message,
    )
  ) {
    const lean = await db
      .from("users")
      .select("id, display_name, countries, account_type, role")
      .eq("account_type", "artist")
      .limit(200);
    if (lean.error) {
      // try role-only artists
      const byRole = await db
        .from("users")
        .select("id, display_name, countries, account_type, role")
        .eq("role", "artist")
        .limit(200);
      if (byRole.error) {
        return { artists: [], error: byRole.error.message };
      }
      return {
        artists: ((byRole.data ?? []) as ArtistPlaceRow[]).filter(isArtistRow),
        error: null,
      };
    }
    return {
      artists: ((lean.data ?? []) as ArtistPlaceRow[]).filter(isArtistRow),
      error: null,
    };
  }

  if (primary.error) {
    return { artists: [], error: primary.error.message };
  }

  let artists = ((primary.data ?? []) as ArtistPlaceRow[]).filter(
    (r) => isArtistRow(r) && isProfilePublic(r),
  );

  if (artists.length < 8) {
    const byRole = await db
      .from("users")
      .select(select)
      .eq("role", "artist")
      .limit(200);
    if (!byRole.error && byRole.data) {
      const extra = (byRole.data as ArtistPlaceRow[]).filter(
        (r) => isArtistRow(r) && isProfilePublic(r),
      );
      const seen = new Set(artists.map((a) => a.id));
      for (const a of extra) {
        if (!seen.has(a.id)) artists.push(a);
      }
    }
  }

  return { artists, error: null };
}

/**
 * Place hubs from public artists' taste countries + their published tracks.
 */
export async function loadPlaceHubs(
  supabase: SupabaseClient,
  taste?: ListenerTaste | null,
): Promise<{ hubs: PlaceHub[]; error: string | null }> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;
    const { artists, error } = await loadPublicArtists(db);
    if (error) return { hubs: [], error };

    const artistIds = artists.map((a) => a.id);
    const trackCountByArtist = new Map<string, number>();

    if (artistIds.length > 0) {
      const { data: tracks } = await db
        .from("tracks")
        .select("id, title, artist_id, status")
        .in("artist_id", artistIds)
        .limit(800);

      for (const t of (tracks ?? []) as TrackRow[]) {
        if (!isPublishedTrack(t) || isDemoTrack(t) || !t.artist_id) continue;
        trackCountByArtist.set(
          t.artist_id,
          (trackCountByArtist.get(t.artist_id) ?? 0) + 1,
        );
      }
    }

    const hubsMap = new Map<
      string,
      { name: string; artists: Set<string>; tracks: number }
    >();

    for (const a of artists) {
      const places = normalizeTasteList(a.countries);
      if (places.length === 0) continue;
      const published = trackCountByArtist.get(a.id) ?? 0;
      for (const place of places) {
        const slug = placeToSlug(place);
        if (!slug) continue;
        const prev = hubsMap.get(slug);
        if (prev) {
          prev.artists.add(a.id);
          prev.tracks += published;
        } else {
          hubsMap.set(slug, {
            name: normalizePlaceName(place),
            artists: new Set([a.id]),
            tracks: published,
          });
        }
      }
    }

    const tasteSlugs = new Set(
      (taste?.countries ?? []).map((c) => placeToSlug(c)).filter(Boolean),
    );

    const hubs: PlaceHub[] = [...hubsMap.entries()]
      .map(([slug, v]) => ({
        slug,
        name: v.name,
        artist_count: v.artists.size,
        track_count: v.tracks,
        for_you: tasteSlugs.has(slug),
      }))
      .sort(
        (a, b) =>
          Number(b.for_you) - Number(a.for_you) ||
          b.track_count - a.track_count ||
          b.artist_count - a.artist_count ||
          a.name.localeCompare(b.name),
      );

    return { hubs, error: null };
  } catch (e) {
    return {
      hubs: [],
      error: e instanceof Error ? e.message : "Failed to load places",
    };
  }
}

export async function loadPlaceDetail(
  supabase: SupabaseClient,
  slug: string,
): Promise<{
  placeName: string | null;
  artists: PlaceArtist[];
  tracks: PlaceTrack[];
  error: string | null;
  notFound: boolean;
}> {
  const cleanSlug = placeToSlug(slug);
  if (!cleanSlug) {
    return {
      placeName: null,
      artists: [],
      tracks: [],
      error: null,
      notFound: true,
    };
  }

  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;
    const { artists: allArtists, error } = await loadPublicArtists(db);
    if (error) {
      return {
        placeName: null,
        artists: [],
        tracks: [],
        error,
        notFound: false,
      };
    }

    const matched = allArtists.filter((a) =>
      normalizeTasteList(a.countries).some((c) => placesMatch(c, cleanSlug)),
    );

    if (matched.length === 0) {
      return {
        placeName: null,
        artists: [],
        tracks: [],
        error: null,
        notFound: true,
      };
    }

    const placeName =
      normalizePlaceName(
        normalizeTasteList(matched[0].countries).find((c) =>
          placesMatch(c, cleanSlug),
        ) || cleanSlug,
      ) || cleanSlug;

    const artists: PlaceArtist[] = matched.map((a) => ({
      id: a.id,
      display_name:
        (typeof a.display_name === "string" && a.display_name.trim()) ||
        "Artist",
    }));

    const ids = matched.map((a) => a.id);
    const { data: trackRows, error: trackError } = await db
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
      )
      .in("artist_id", ids)
      .order("created_at", { ascending: false })
      .limit(80);

    if (trackError) {
      return {
        placeName,
        artists,
        tracks: [],
        error: trackError.message,
        notFound: false,
      };
    }

    const rows = ((trackRows ?? []) as TrackRow[])
      .filter((t) => isPublishedTrack(t) && !isDemoTrack(t))
      .slice(0, 40);

    const nameById = await loadArtistCreditMap(
      db,
      rows.map((r) => r.artist_id).filter(Boolean) as string[],
    );
    // Prefer portal display names for matched artists
    for (const a of artists) {
      if (!nameById.has(a.id) || nameById.get(a.id) === "Private artist") {
        nameById.set(a.id, a.display_name);
      }
    }
    const likes = await loadLikeCountMap(
      db,
      rows.map((t) => t.id),
    );

    const tracks: PlaceTrack[] = rows.map((t) => ({
      ...t,
      artist_name: t.artist_id
        ? (nameById.get(t.artist_id) ?? null)
        : null,
      like_count: likes.get(t.id) ?? 0,
    }));

    return {
      placeName,
      artists,
      tracks,
      error: null,
      notFound: false,
    };
  } catch (e) {
    return {
      placeName: null,
      artists: [],
      tracks: [],
      error: e instanceof Error ? e.message : "Failed to load place",
      notFound: false,
    };
  }
}
