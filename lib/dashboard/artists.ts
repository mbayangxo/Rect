import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { placeOverlapScore } from "@/lib/dashboard/charts";
import { isProfilePublic } from "@/lib/dashboard/privacy";
import {
  genreOverlapScore,
  normalizeTasteList,
  type ListenerTaste,
} from "@/lib/dashboard/taste";

export type ArtistPortal = {
  id: string;
  display_name: string;
  genre: string | null;
  genres: string[];
  countries: string[];
  avatar_url: string | null;
  created_at: string | null;
  account_type: string | null;
};

export type ArtistsLoadResult =
  | {
      ok: true;
      artists: ArtistPortal[];
      empty: boolean;
      error: null;
    }
  | {
      ok: false;
      artists: [];
      empty: true;
      error: string;
    };

function mapArtists(
  data: Record<string, unknown>[] | null,
): ArtistPortal[] {
  return (data ?? [])
    .filter((row) => isProfilePublic(row as { privacy_public_profile?: boolean }))
    .map((row) => {
      const genres = Array.isArray(row.genres)
        ? row.genres.filter((g): g is string => typeof g === "string")
        : [];
      return {
        id: row.id as string,
        display_name:
          (typeof row.display_name === "string" && row.display_name.trim()) ||
          "Artist",
        genre: genres[0] ?? null,
        genres,
        countries: normalizeTasteList(row.countries),
        avatar_url:
          typeof row.avatar_url === "string" && row.avatar_url.trim()
            ? row.avatar_url.trim()
            : null,
        created_at: (row.created_at as string | null) ?? null,
        account_type: (row.account_type as string | null) ?? null,
      };
    });
}

/**
 * CONNECTION 4 — artist portals.
 * Prefer artists whose places + genres overlap listener taste; fill with newest.
 * Hides users with privacy_public_profile = false.
 */
export async function loadArtistPortals(
  supabase: SupabaseClient,
  taste?: ListenerTaste | null,
): Promise<ArtistsLoadResult> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;
    const pool = 24;

    let data: Record<string, unknown>[] | null = null;
    let error: { message: string } | null = null;

    const select =
      "id, display_name, genres, countries, avatar_url, account_type, role, created_at, privacy_public_profile";

    const primary = await db
      .from("users")
      .select(select)
      .eq("account_type", "artist")
      .order("created_at", { ascending: false })
      .limit(pool);

    if (
      primary.error &&
      /privacy_public_profile|avatar_url|countries|column .* does not exist/i.test(
        primary.error.message,
      )
    ) {
      const leanSelect = /avatar_url/i.test(primary.error.message)
        ? "id, display_name, genres, countries, account_type, role, created_at, privacy_public_profile"
        : "id, display_name, genres, countries, account_type, role, created_at";
      const lean = await db
        .from("users")
        .select(leanSelect)
        .eq("account_type", "artist")
        .order("created_at", { ascending: false })
        .limit(pool);
      if (
        lean.error &&
        /countries|column .* does not exist/i.test(lean.error.message)
      ) {
        const bare = await db
          .from("users")
          .select("id, display_name, genres, account_type, role, created_at")
          .eq("account_type", "artist")
          .order("created_at", { ascending: false })
          .limit(pool);
        data = (bare.data ?? null) as Record<string, unknown>[] | null;
        error = bare.error;
      } else {
        data = (lean.data ?? null) as Record<string, unknown>[] | null;
        error = lean.error;
      }
    } else {
      data = (primary.data ?? null) as Record<string, unknown>[] | null;
      error = primary.error;
    }

    if ((!data || data.length === 0) && !error) {
      const fallback = await db
        .from("users")
        .select(select)
        .eq("role", "artist")
        .order("created_at", { ascending: false })
        .limit(pool);
      if (
        fallback.error &&
        /privacy_public_profile|avatar_url|countries|column .* does not exist/i.test(
          fallback.error.message,
        )
      ) {
        const lean = await db
          .from("users")
          .select(
            "id, display_name, genres, countries, account_type, role, created_at",
          )
          .eq("role", "artist")
          .order("created_at", { ascending: false })
          .limit(pool);
        if (
          lean.error &&
          /countries|column .* does not exist/i.test(lean.error.message)
        ) {
          const bare = await db
            .from("users")
            .select("id, display_name, genres, account_type, role, created_at")
            .eq("role", "artist")
            .order("created_at", { ascending: false })
            .limit(pool);
          data = (bare.data ?? null) as Record<string, unknown>[] | null;
          error = bare.error;
        } else {
          data = (lean.data ?? null) as Record<string, unknown>[] | null;
          error = lean.error;
        }
      } else {
        data = (fallback.data ?? null) as Record<string, unknown>[] | null;
        error = fallback.error;
      }
    }

    if (error) {
      return { ok: false, artists: [], empty: true, error: error.message };
    }

    const preferredGenres = taste?.genres ?? [];
    const preferredPlaces = taste?.countries ?? [];
    const artists = mapArtists(data)
      .sort((a, b) => {
        const placeA = placeOverlapScore(a.countries, preferredPlaces);
        const placeB = placeOverlapScore(b.countries, preferredPlaces);
        const genreA = genreOverlapScore(a.genres, preferredGenres);
        const genreB = genreOverlapScore(b.genres, preferredGenres);
        return (
          placeB - placeA ||
          genreB - genreA ||
          (b.created_at || "").localeCompare(a.created_at || "")
        );
      })
      .slice(0, 4);

    return {
      ok: true,
      artists,
      empty: artists.length === 0,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      artists: [],
      empty: true,
      error: e instanceof Error ? e.message : "Failed to load artists",
    };
  }
}
