import type { SupabaseClient } from "@supabase/supabase-js";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { isProfilePublic } from "@/lib/dashboard/privacy";
import { isDemoTrack, isPublishedTrack, type TrackRow } from "@/lib/tracks";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type FollowedArtist = {
  id: string;
  display_name: string;
  genres: string[];
  city: string | null;
  followed_at: string | null;
};

export type FollowingFeedTrack = TrackRow & {
  artist_name: string | null;
};

export type FollowingLoadResult = {
  artists: FollowedArtist[];
  tracks: FollowingFeedTrack[];
  missingTable: boolean;
  error: string | null;
};

export async function loadFollowerCount(
  supabase: SupabaseClient,
  artistId: string,
): Promise<{ count: number; missingTable: boolean }> {
  try {
    const { count, error } = await supabase
      .from("artist_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("artist_id", artistId);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { count: 0, missingTable: true };
      }
      return { count: 0, missingTable: false };
    }
    return { count: count ?? 0, missingTable: false };
  } catch {
    return { count: 0, missingTable: false };
  }
}

export async function loadIsFollowing(
  supabase: SupabaseClient,
  followerId: string,
  artistId: string,
): Promise<{ following: boolean; missingTable: boolean }> {
  try {
    const { data, error } = await supabase
      .from("artist_follows")
      .select("artist_id")
      .eq("follower_id", followerId)
      .eq("artist_id", artistId)
      .maybeSingle();

    if (error) {
      if (isMissingRelation(error.message)) {
        return { following: false, missingTable: true };
      }
      return { following: false, missingTable: false };
    }
    return { following: Boolean(data), missingTable: false };
  } catch {
    return { following: false, missingTable: false };
  }
}

export type ArtistFollower = {
  id: string;
  display_name: string;
  followed_at: string | null;
};

export type ArtistFollowersResult = {
  followers: ArtistFollower[];
  missingTable: boolean;
  error: string | null;
};

/**
 * People following this artist (artist-owned roster).
 */
export async function loadArtistFollowers(
  supabase: SupabaseClient,
  artistId: string,
  limit = 40,
): Promise<ArtistFollowersResult> {
  try {
    const { data: rows, error } = await supabase
      .from("artist_follows")
      .select("follower_id, created_at")
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { followers: [], missingTable: true, error: null };
      }
      return { followers: [], missingTable: false, error: error.message };
    }

    const followRows = rows ?? [];
    if (followRows.length === 0) {
      return { followers: [], missingTable: false, error: null };
    }

    const ids = followRows
      .map((r) => r.follower_id as string)
      .filter(Boolean);
    const atById = new Map<string, string | null>();
    for (const r of followRows) {
      atById.set(
        r.follower_id as string,
        (r.created_at as string | null) ?? null,
      );
    }

    const { data: users, error: userError } = await supabase
      .from("users")
      .select("id, display_name, privacy_public_profile")
      .in("id", ids);

    if (userError && /privacy_public_profile|column .* does not exist/i.test(userError.message)) {
      const lean = await supabase
        .from("users")
        .select("id, display_name")
        .in("id", ids);
      if (lean.error) {
        return {
          followers: [],
          missingTable: false,
          error: lean.error.message,
        };
      }
      const byId = new Map(
        (lean.data ?? []).map((u) => [
          u.id as string,
          (typeof u.display_name === "string" && u.display_name.trim()) ||
            "Listener",
        ]),
      );
      return {
        followers: ids.map((id) => ({
          id,
          display_name: byId.get(id) ?? "Listener",
          followed_at: atById.get(id) ?? null,
        })),
        missingTable: false,
        error: null,
      };
    }

    if (userError) {
      return {
        followers: [],
        missingTable: false,
        error: userError.message,
      };
    }

    const byId = new Map(
      (users ?? []).map((u) => {
        const publicOk = isProfilePublic(
          u as { privacy_public_profile?: boolean | null },
        );
        const name =
          publicOk &&
          typeof u.display_name === "string" &&
          u.display_name.trim()
            ? u.display_name.trim()
            : "Listener";
        return [u.id as string, name] as const;
      }),
    );

    return {
      followers: ids.map((id) => ({
        id,
        display_name: byId.get(id) ?? "Listener",
        followed_at: atById.get(id) ?? null,
      })),
      missingTable: false,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load followers";
    return {
      followers: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

/**
 * Artists the user follows + recent published tracks from those artists.
 */
export async function loadFollowingFeed(
  supabase: SupabaseClient,
  userId: string,
): Promise<FollowingLoadResult> {
  try {
    const { data: follows, error } = await supabase
      .from("artist_follows")
      .select("artist_id, created_at")
      .eq("follower_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { artists: [], tracks: [], missingTable: true, error: null };
      }
      return {
        artists: [],
        tracks: [],
        missingTable: false,
        error: error.message,
      };
    }

    const followRows = follows ?? [];
    if (followRows.length === 0) {
      return { artists: [], tracks: [], missingTable: false, error: null };
    }

    const artistIds = followRows
      .map((r) => r.artist_id as string)
      .filter(Boolean);
    const followedAtById = new Map<string, string | null>();
    for (const r of followRows) {
      followedAtById.set(
        r.artist_id as string,
        (r.created_at as string | null) ?? null,
      );
    }

    let userRows: Record<string, unknown>[] | null = null;
    const fullUsers = await supabase
      .from("users")
      .select(
        "id, display_name, genres, city, privacy_public_profile, account_type, role",
      )
      .in("id", artistIds);

    if (
      fullUsers.error &&
      /privacy_public_profile|city|column .* does not exist/i.test(
        fullUsers.error.message,
      )
    ) {
      const lean = await supabase
        .from("users")
        .select("id, display_name, genres, account_type, role")
        .in("id", artistIds);
      if (lean.error) {
        return {
          artists: [],
          tracks: [],
          missingTable: false,
          error: lean.error.message,
        };
      }
      userRows = (lean.data ?? []) as Record<string, unknown>[];
    } else if (fullUsers.error) {
      return {
        artists: [],
        tracks: [],
        missingTable: false,
        error: fullUsers.error.message,
      };
    } else {
      userRows = (fullUsers.data ?? []) as Record<string, unknown>[];
    }

    const artistsById = new Map(
      (userRows ?? [])
        .filter((row) =>
          isProfilePublic(
            row as { privacy_public_profile?: boolean | null },
          ),
        )
        .map((row) => {
          const genres = Array.isArray(row.genres)
            ? row.genres.filter((g): g is string => typeof g === "string")
            : [];
          const cityRaw = row.city;
          const artist: FollowedArtist = {
            id: row.id as string,
            display_name:
              (typeof row.display_name === "string" &&
                row.display_name.trim()) ||
              "Artist",
            genres,
            city:
              typeof cityRaw === "string" && cityRaw.trim()
                ? cityRaw.trim()
                : null,
            followed_at: followedAtById.get(row.id as string) ?? null,
          };
          return [artist.id, artist] as const;
        }),
    );

    const artists: FollowedArtist[] = [];
    for (const id of artistIds) {
      const a = artistsById.get(id);
      if (a) artists.push(a);
    }

    const publicArtistIds = artists.map((a) => a.id);
    if (publicArtistIds.length === 0) {
      return { artists: [], tracks: [], missingTable: false, error: null };
    }

    const { data: trackRows, error: trackError } = await supabase
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
      )
      .in("artist_id", publicArtistIds)
      .order("created_at", { ascending: false })
      .limit(40);

    if (trackError) {
      return {
        artists,
        tracks: [],
        missingTable: false,
        error: trackError.message,
      };
    }

    const rows = ((trackRows ?? []) as TrackRow[]).filter(
      (t) => !isDemoTrack(t) && isPublishedTrack(t),
    );
    const nameById = await loadArtistCreditMap(
      supabase,
      rows.map((r) => r.artist_id).filter(Boolean) as string[],
    );

    const tracks: FollowingFeedTrack[] = rows.map((t) => ({
      ...t,
      artist_name: t.artist_id
        ? (nameById.get(t.artist_id) ??
          artistsById.get(t.artist_id)?.display_name ??
          null)
        : null,
    }));

    return { artists, tracks, missingTable: false, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load following";
    return {
      artists: [],
      tracks: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

export type ToggleFollowResult =
  | {
      ok: true;
      following: boolean;
      artist_id: string;
      follower_count: number;
    }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "missing_table"
        | "cannot_follow_self"
        | "failed";
    };

export async function toggleArtistFollow(
  supabase: SupabaseClient,
  artistId: string,
): Promise<ToggleFollowResult> {
  const id = artistId.trim();
  if (!id) {
    return { ok: false, error: "artist_id is required", code: "failed" };
  }

  const { data, error } = await supabase.rpc("toggle_artist_follow", {
    p_artist_id: id,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return toggleArtistFollowFallback(supabase, id);
    }
    if (/not_authenticated/i.test(error.message)) {
      return {
        ok: false,
        error: "Sign in required",
        code: "not_authenticated",
      };
    }
    if (/cannot_follow_self/i.test(error.message)) {
      return {
        ok: false,
        error: "You can’t follow yourself",
        code: "cannot_follow_self",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as {
    following?: boolean;
    artist_id?: string;
    follower_count?: number;
  } | null;

  return {
    ok: true,
    following: Boolean(row?.following),
    artist_id: typeof row?.artist_id === "string" ? row.artist_id : id,
    follower_count:
      typeof row?.follower_count === "number" ? row.follower_count : 0,
  };
}

async function toggleArtistFollowFallback(
  supabase: SupabaseClient,
  artistId: string,
): Promise<ToggleFollowResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Sign in required",
      code: "not_authenticated",
    };
  }
  if (user.id === artistId) {
    return {
      ok: false,
      error: "You can’t follow yourself",
      code: "cannot_follow_self",
    };
  }

  const { data: existing, error: readError } = await supabase
    .from("artist_follows")
    .select("artist_id")
    .eq("follower_id", user.id)
    .eq("artist_id", artistId)
    .maybeSingle();

  if (readError) {
    if (isMissingRelation(readError.message)) {
      return {
        ok: false,
        error: "Run artist follows SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: readError.message, code: "failed" };
  }

  let following: boolean;
  if (existing) {
    const { error: delError } = await supabase
      .from("artist_follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("artist_id", artistId);
    if (delError) {
      return { ok: false, error: delError.message, code: "failed" };
    }
    following = false;
  } else {
    const { error: insError } = await supabase.from("artist_follows").insert({
      follower_id: user.id,
      artist_id: artistId,
    });
    if (insError) {
      if (isMissingRelation(insError.message)) {
        return {
          ok: false,
          error: "Run artist follows SQL in Supabase first",
          code: "missing_table",
        };
      }
      return { ok: false, error: insError.message, code: "failed" };
    }
    following = true;
  }

  const { count } = await supabase
    .from("artist_follows")
    .select("follower_id", { count: "exact", head: true })
    .eq("artist_id", artistId);

  return {
    ok: true,
    following,
    artist_id: artistId,
    follower_count: count ?? 0,
  };
}

/** Remove every artist follow for the signed-in user. */
export async function clearAllFollows(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  | { ok: true; deleted: number }
  | { ok: false; error: string; code?: "missing_table" | "failed" }
> {
  const { data, error } = await supabase
    .from("artist_follows")
    .delete()
    .eq("follower_id", userId)
    .select("artist_id");

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run artist follows SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  return { ok: true, deleted: data?.length ?? 0 };
}

