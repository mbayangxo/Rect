import type { SupabaseClient } from "@supabase/supabase-js";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { loadBlockedEitherIds } from "@/lib/dashboard/blocks";
import { isProfilePublic } from "@/lib/dashboard/privacy";
import { isDemoTrack, isPublishedTrack, withLiveCatalogTracks, type TrackRow } from "@/lib/tracks";

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
  avatar_url: string | null;
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

/** Which of `artistIds` the viewer already follows (batch). */
export async function loadFollowingAmongArtists(
  supabase: SupabaseClient,
  followerId: string,
  artistIds: string[],
): Promise<{ followingIds: string[]; missingTable: boolean }> {
  const unique = [...new Set(artistIds.filter(Boolean))];
  if (unique.length === 0) {
    return { followingIds: [], missingTable: false };
  }

  try {
    const { data, error } = await supabase
      .from("artist_follows")
      .select("artist_id")
      .eq("follower_id", followerId)
      .in("artist_id", unique);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { followingIds: [], missingTable: true };
      }
      return { followingIds: [], missingTable: false };
    }

    return {
      followingIds: (data ?? [])
        .map((r) => r.artist_id as string)
        .filter(Boolean),
      missingTable: false,
    };
  } catch {
    return { followingIds: [], missingTable: false };
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

    const blocked = await loadBlockedEitherIds(supabase, userId);
    const hide = new Set(
      !blocked.missingTable && blocked.ids.length > 0 ? blocked.ids : [],
    );

    let artistIds = followRows
      .map((r) => r.artist_id as string)
      .filter(Boolean);
    if (hide.size > 0) {
      artistIds = artistIds.filter((id) => !hide.has(id));
    }
    if (artistIds.length === 0) {
      return { artists: [], tracks: [], missingTable: false, error: null };
    }

    const followedAtById = new Map<string, string | null>();
    for (const r of followRows) {
      const id = r.artist_id as string;
      if (hide.has(id)) continue;
      followedAtById.set(id, (r.created_at as string | null) ?? null);
    }

    let userRows: Record<string, unknown>[] | null = null;
    const fullUsers = await supabase
      .from("users")
      .select(
        "id, display_name, genres, city, avatar_url, privacy_public_profile, account_type, role",
      )
      .in("id", artistIds);

    if (
      fullUsers.error &&
      /privacy_public_profile|city|avatar_url|column .* does not exist/i.test(
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
            avatar_url:
              typeof row.avatar_url === "string" && row.avatar_url.trim()
                ? row.avatar_url.trim()
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

    const { data: trackRows, error: trackError } = await withLiveCatalogTracks(
      supabase
        .from("tracks")
        .select(
          "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
        )
        .in("artist_id", publicArtistIds),
    )
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

/**
 * Public profile: artists a person follows (opt-in privacy_show_followed_artists).
 */
export async function loadPublicFollowedArtists(
  supabase: SupabaseClient,
  personId: string,
  limit = 12,
): Promise<{
  artists: FollowedArtist[];
  sharing: boolean;
  missingColumn: boolean;
  missingTable: boolean;
  error: string | null;
}> {
  const id = personId.trim();
  if (!id) {
    return {
      artists: [],
      sharing: false,
      missingColumn: false,
      missingTable: false,
      error: null,
    };
  }

  try {
    const full = await supabase
      .from("users")
      .select("privacy_public_profile, privacy_show_followed_artists")
      .eq("id", id)
      .maybeSingle();

    if (
      full.error &&
      /privacy_show_followed_artists|column .* does not exist/i.test(
        full.error.message,
      )
    ) {
      return {
        artists: [],
        sharing: false,
        missingColumn: true,
        missingTable: false,
        error: null,
      };
    }
    if (full.error) {
      return {
        artists: [],
        sharing: false,
        missingColumn: false,
        missingTable: false,
        error: full.error.message,
      };
    }

    const publicOk = isProfilePublic({
      privacy_public_profile: full.data?.privacy_public_profile ?? true,
    });
    const showArtists = full.data?.privacy_show_followed_artists === true;
    if (!publicOk || !showArtists) {
      return {
        artists: [],
        sharing: false,
        missingColumn: false,
        missingTable: false,
        error: null,
      };
    }

    let followRows: { artist_id: string; created_at: string | null }[] = [];

    const rpc = await supabase.rpc("person_followed_artists", {
      p_person_id: id,
      p_limit: limit,
    });

    if (!rpc.error) {
      followRows = ((rpc.data ?? []) as {
        artist_id?: string;
        followed_at?: string | null;
      }[])
        .map((r) => ({
          artist_id: typeof r.artist_id === "string" ? r.artist_id : "",
          created_at: r.followed_at ?? null,
        }))
        .filter((r) => r.artist_id);
    } else if (!isMissingRelation(rpc.error.message)) {
      return {
        artists: [],
        sharing: true,
        missingColumn: false,
        missingTable: false,
        error: rpc.error.message,
      };
    } else {
      const { data: follows, error } = await supabase
        .from("artist_follows")
        .select("artist_id, created_at")
        .eq("follower_id", id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        if (isMissingRelation(error.message)) {
          return {
            artists: [],
            sharing: true,
            missingColumn: false,
            missingTable: true,
            error: null,
          };
        }
        return {
          artists: [],
          sharing: true,
          missingColumn: false,
          missingTable: false,
          error: error.message,
        };
      }
      followRows = (follows ?? []).map((r) => ({
        artist_id: r.artist_id as string,
        created_at: (r.created_at as string | null) ?? null,
      }));
    }

    if (followRows.length === 0) {
      return {
        artists: [],
        sharing: true,
        missingColumn: false,
        missingTable: false,
        error: null,
      };
    }

    const artistIds = followRows.map((r) => r.artist_id).filter(Boolean);
    const followedAtById = new Map(
      followRows.map((r) => [r.artist_id, r.created_at]),
    );

    let userRows: Record<string, unknown>[] | null = null;
    const fullUsers = await supabase
      .from("users")
      .select(
        "id, display_name, genres, city, avatar_url, privacy_public_profile, account_type, role",
      )
      .in("id", artistIds);

    if (
      fullUsers.error &&
      /privacy_public_profile|city|avatar_url|column .* does not exist/i.test(
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
          sharing: true,
          missingColumn: false,
          missingTable: false,
          error: lean.error.message,
        };
      }
      userRows = (lean.data ?? []) as Record<string, unknown>[];
    } else if (fullUsers.error) {
      return {
        artists: [],
        sharing: true,
        missingColumn: false,
        missingTable: false,
        error: fullUsers.error.message,
      };
    } else {
      userRows = (fullUsers.data ?? []) as Record<string, unknown>[];
    }

    const artistsById = new Map(
      (userRows ?? [])
        .filter((row) => {
          const isArtist =
            row.account_type === "artist" || row.role === "artist";
          return (
            isArtist &&
            isProfilePublic(
              row as { privacy_public_profile?: boolean | null },
            )
          );
        })
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
            avatar_url:
              typeof row.avatar_url === "string" && row.avatar_url.trim()
                ? row.avatar_url.trim()
                : null,
            followed_at: followedAtById.get(row.id as string) ?? null,
          };
          return [artist.id, artist] as const;
        }),
    );

    const artists: FollowedArtist[] = [];
    for (const aid of artistIds) {
      const a = artistsById.get(aid);
      if (a) artists.push(a);
    }

    return {
      artists,
      sharing: true,
      missingColumn: false,
      missingTable: false,
      error: null,
    };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Failed to load followed artists";
    return {
      artists: [],
      sharing: false,
      missingColumn: false,
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
        | "blocked"
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
    if (/blocked/i.test(error.message)) {
      return {
        ok: false,
        error: "You can’t follow this artist",
        code: "blocked",
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
    const { data: blockedPair, error: blockErr } = await supabase.rpc(
      "users_are_blocked",
      { p_a: user.id, p_b: artistId },
    );
    if (
      !blockErr &&
      blockedPair === true
    ) {
      return {
        ok: false,
        error: "You can’t follow this artist",
        code: "blocked",
      };
    }

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

export const FOLLOW_THANKS_MAX = 280;

export async function sendFollowThanks(
  supabase: SupabaseClient,
  notificationId: number,
  messageRaw: string,
): Promise<
  | {
      ok: true;
      notification_id: number;
      thanks_message: string;
      skipped?: string;
    }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "missing_table"
        | "notification_not_found"
        | "not_recipient"
        | "not_a_follow"
        | "already_thanked"
        | "blocked"
        | "invalid_message"
        | "failed";
    }
> {
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

  const message = messageRaw.replace(/\s+/g, " ").trim();
  if (!message || message.length > FOLLOW_THANKS_MAX) {
    return {
      ok: false,
      error: `Thanks must be 1–${FOLLOW_THANKS_MAX} characters`,
      code: "invalid_message",
    };
  }

  const { data, error } = await supabase.rpc("send_follow_thanks", {
    p_notification_id: notificationId,
    p_message: message,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run artist follow thanks SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/notification_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Follow notification not found",
        code: "notification_not_found",
      };
    }
    if (/not_recipient/i.test(error.message)) {
      return {
        ok: false,
        error: "Only the artist can thank",
        code: "not_recipient",
      };
    }
    if (/not_a_follow/i.test(error.message)) {
      return {
        ok: false,
        error: "Not an artist follow notification",
        code: "not_a_follow",
      };
    }
    if (/already_thanked/i.test(error.message)) {
      return {
        ok: false,
        error: "You already thanked for this follow",
        code: "already_thanked",
      };
    }
    if (/blocked/i.test(error.message)) {
      return {
        ok: false,
        error: "You can’t thank this person",
        code: "blocked",
      };
    }
    if (/message_required/i.test(error.message)) {
      return {
        ok: false,
        error: "Write a short thank-you",
        code: "invalid_message",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as {
    thanks_message?: string;
    notification_id?: number;
    skipped?: string;
  } | null;

  return {
    ok: true,
    notification_id: Number(row?.notification_id ?? notificationId),
    thanks_message:
      (typeof row?.thanks_message === "string" && row.thanks_message.trim()) ||
      message,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

