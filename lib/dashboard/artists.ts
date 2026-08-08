import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  genreOverlapScore,
  type ListenerTaste,
} from "@/lib/dashboard/taste";
import { isProfilePublic } from "@/lib/dashboard/privacy";

export type ArtistPortal = {
  id: string;
  display_name: string;
  genre: string | null;
  genres: string[];
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
        created_at: (row.created_at as string | null) ?? null,
        account_type: (row.account_type as string | null) ?? null,
      };
    });
}

/**
 * CONNECTION 4 — artist portals.
 * Prefer artists whose genres overlap listener taste; fill with newest.
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
      "id, display_name, genres, account_type, role, created_at, privacy_public_profile";

    const primary = await db
      .from("users")
      .select(select)
      .eq("account_type", "artist")
      .order("created_at", { ascending: false })
      .limit(pool);

    if (
      primary.error &&
      /privacy_public_profile|column .* does not exist/i.test(
        primary.error.message,
      )
    ) {
      const lean = await db
        .from("users")
        .select("id, display_name, genres, account_type, role, created_at")
        .eq("account_type", "artist")
        .order("created_at", { ascending: false })
        .limit(pool);
      data = (lean.data ?? null) as Record<string, unknown>[] | null;
      error = lean.error;
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
        /privacy_public_profile|column .* does not exist/i.test(
          fallback.error.message,
        )
      ) {
        const lean = await db
          .from("users")
          .select("id, display_name, genres, account_type, role, created_at")
          .eq("role", "artist")
          .order("created_at", { ascending: false })
          .limit(pool);
        data = (lean.data ?? null) as Record<string, unknown>[] | null;
        error = lean.error;
      } else {
        data = (fallback.data ?? null) as Record<string, unknown>[] | null;
        error = fallback.error;
      }
    }

    if (error) {
      return { ok: false, artists: [], empty: true, error: error.message };
    }

    const preferred = taste?.genres ?? [];
    const artists = mapArtists(data)
      .sort((a, b) => {
        const scoreA = genreOverlapScore(a.genres, preferred);
        const scoreB = genreOverlapScore(b.genres, preferred);
        return (
          scoreB - scoreA ||
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
