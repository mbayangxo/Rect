import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

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

/**
 * CONNECTION 4 — artist portals.
 * Top 4 artists from users where account_type = 'artist', newest first.
 * Falls back to role = 'artist' when account_type filter returns none.
 */
export async function loadArtistPortals(
  supabase: SupabaseClient,
): Promise<ArtistsLoadResult> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    let { data, error } = await db
      .from("users")
      .select("id, display_name, genres, account_type, role, created_at")
      .eq("account_type", "artist")
      .order("created_at", { ascending: false })
      .limit(4);

    if ((!data || data.length === 0) && !error) {
      const fallback = await db
        .from("users")
        .select("id, display_name, genres, account_type, role, created_at")
        .eq("role", "artist")
        .order("created_at", { ascending: false })
        .limit(4);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return { ok: false, artists: [], empty: true, error: error.message };
    }

    const artists: ArtistPortal[] = (data ?? []).map((row) => {
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
