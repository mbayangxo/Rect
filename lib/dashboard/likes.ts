import type { SupabaseClient } from "@supabase/supabase-js";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { isProfilePublic } from "@/lib/dashboard/privacy";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoTrack, isPublishedTrack, type TrackRow } from "@/lib/tracks";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

function isMissingColumn(message: string) {
  return /column .* does not exist|PGRST204/i.test(message);
}

export type LikesLoadResult = {
  likedIds: string[];
  missingTable: boolean;
  error: string | null;
};

export async function loadLikedTrackIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<LikesLoadResult> {
  try {
    const { data, error } = await supabase
      .from("track_likes")
      .select("track_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { likedIds: [], missingTable: true, error: null };
      }
      return { likedIds: [], missingTable: false, error: error.message };
    }

    const likedIds = (data ?? [])
      .map((r) => r.track_id as string)
      .filter(Boolean);

    return { likedIds, missingTable: false, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load likes";
    return {
      likedIds: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

/** Which of `trackIds` the viewer already liked (batch). */
export async function loadLikedAmongTrackIds(
  supabase: SupabaseClient,
  userId: string,
  trackIds: string[],
): Promise<LikesLoadResult> {
  const unique = [...new Set(trackIds.filter(Boolean))];
  if (unique.length === 0) {
    return { likedIds: [], missingTable: false, error: null };
  }

  try {
    const { data, error } = await supabase
      .from("track_likes")
      .select("track_id")
      .eq("user_id", userId)
      .in("track_id", unique);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { likedIds: [], missingTable: true, error: null };
      }
      return { likedIds: [], missingTable: false, error: error.message };
    }

    const likedIds = (data ?? [])
      .map((r) => r.track_id as string)
      .filter(Boolean);

    return { likedIds, missingTable: false, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load likes";
    return {
      likedIds: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

export type LikedTrack = TrackRow & {
  liked_at: string | null;
};

export type LikedTracksResult = {
  tracks: LikedTrack[];
  missingTable: boolean;
  error: string | null;
};

/**
 * Liked library — track_likes joined to tracks (+ artist names).
 */
export async function loadLikedTracks(
  supabase: SupabaseClient,
  userId: string,
): Promise<LikedTracksResult> {
  try {
    const { data: likes, error } = await supabase
      .from("track_likes")
      .select("track_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { tracks: [], missingTable: true, error: null };
      }
      return { tracks: [], missingTable: false, error: error.message };
    }

    const likeRows = likes ?? [];
    if (likeRows.length === 0) {
      return { tracks: [], missingTable: false, error: null };
    }

    const ids = likeRows
      .map((r) => r.track_id as string)
      .filter(Boolean);
    const likedAtById = new Map<string, string | null>();
    for (const r of likeRows) {
      likedAtById.set(
        r.track_id as string,
        (r.created_at as string | null) ?? null,
      );
    }

    const { data: trackRows, error: trackError } = await supabase
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
      )
      .in("id", ids);

    if (trackError) {
      return { tracks: [], missingTable: false, error: trackError.message };
    }

    const rows = ((trackRows ?? []) as TrackRow[]).filter((t) => !isDemoTrack(t));
    const artistIds = [
      ...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[]),
    ];
    const nameById = await loadArtistCreditMap(supabase, artistIds);

    const byId = new Map(
      rows.map((r) => [
        r.id,
        {
          ...r,
          artist_name: r.artist_id
            ? (nameById.get(r.artist_id) ?? null)
            : null,
          liked_at: likedAtById.get(r.id) ?? null,
        } satisfies LikedTrack,
      ]),
    );

    const tracks: LikedTrack[] = [];
    for (const id of ids) {
      const t = byId.get(id);
      if (t) tracks.push(t);
    }

    return {
      tracks,
      missingTable: false,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load liked tracks";
    return {
      tracks: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

/**
 * Opt-in public likes for /people/[id] (privacy_show_likes + public profile).
 */
export async function loadPublicLikedTracks(
  supabase: SupabaseClient,
  userId: string,
  limit = 12,
): Promise<{
  tracks: LikedTrack[];
  sharing: boolean;
  missingColumn: boolean;
  missingTable: boolean;
  error: string | null;
}> {
  const id = userId.trim();
  if (!id) {
    return {
      tracks: [],
      sharing: false,
      missingColumn: false,
      missingTable: false,
      error: null,
    };
  }

  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    let profile: {
      privacy_public_profile?: boolean | null;
      privacy_show_likes?: boolean | null;
    } | null = null;

    const full = await db
      .from("users")
      .select("privacy_public_profile, privacy_show_likes")
      .eq("id", id)
      .maybeSingle();

    if (full.error && isMissingColumn(full.error.message)) {
      if (/privacy_show_likes/i.test(full.error.message)) {
        return {
          tracks: [],
          sharing: false,
          missingColumn: true,
          missingTable: false,
          error: null,
        };
      }
      const lean = await db
        .from("users")
        .select("privacy_public_profile")
        .eq("id", id)
        .maybeSingle();
      if (lean.error) {
        return {
          tracks: [],
          sharing: false,
          missingColumn: true,
          missingTable: false,
          error: null,
        };
      }
      return {
        tracks: [],
        sharing: false,
        missingColumn: true,
        missingTable: false,
        error: null,
      };
    }

    if (full.error) {
      return {
        tracks: [],
        sharing: false,
        missingColumn: false,
        missingTable: false,
        error: full.error.message,
      };
    }

    profile = full.data;
    const publicOk = isProfilePublic({
      privacy_public_profile: profile?.privacy_public_profile ?? true,
    });
    const showLikes = profile?.privacy_show_likes === true;

    if (!publicOk || !showLikes) {
      return {
        tracks: [],
        sharing: false,
        missingColumn: false,
        missingTable: false,
        error: null,
      };
    }

    // Prefer user-scoped client so RLS public-shared policy applies;
    // admin also works for hydration when service role is present.
    const { data: likes, error } = await db
      .from("track_likes")
      .select("track_id, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.message)) {
        return {
          tracks: [],
          sharing: true,
          missingColumn: false,
          missingTable: true,
          error: null,
        };
      }
      return {
        tracks: [],
        sharing: true,
        missingColumn: false,
        missingTable: false,
        error: error.message,
      };
    }

    const likeRows = likes ?? [];
    if (likeRows.length === 0) {
      return {
        tracks: [],
        sharing: true,
        missingColumn: false,
        missingTable: false,
        error: null,
      };
    }

    const ids = likeRows.map((r) => r.track_id as string).filter(Boolean);
    const likedAtById = new Map<string, string | null>();
    for (const r of likeRows) {
      likedAtById.set(
        r.track_id as string,
        (r.created_at as string | null) ?? null,
      );
    }

    const { data: trackRows, error: trackError } = await db
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
      )
      .in("id", ids);

    if (trackError) {
      return {
        tracks: [],
        sharing: true,
        missingColumn: false,
        missingTable: false,
        error: trackError.message,
      };
    }

    const rows = ((trackRows ?? []) as TrackRow[]).filter(
      (t) => !isDemoTrack(t) && isPublishedTrack(t),
    );
    const artistIds = [
      ...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[]),
    ];
    const nameById = await loadArtistCreditMap(db, artistIds);

    const byId = new Map(
      rows.map((r) => [
        r.id,
        {
          ...r,
          artist_name: r.artist_id
            ? (nameById.get(r.artist_id) ?? null)
            : null,
          liked_at: likedAtById.get(r.id) ?? null,
        } satisfies LikedTrack,
      ]),
    );

    const tracks: LikedTrack[] = [];
    for (const tid of ids) {
      const t = byId.get(tid);
      if (t) tracks.push(t);
    }

    return {
      tracks,
      sharing: true,
      missingColumn: false,
      missingTable: false,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load public likes";
    return {
      tracks: [],
      sharing: false,
      missingColumn: isMissingColumn(msg),
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) || isMissingColumn(msg) ? null : msg,
    };
  }
}

export type ToggleLikeResult =
  | { ok: true; liked: boolean; track_id: string }
  | {
      ok: false;
      error: string;
      code?: "not_authenticated" | "missing_table" | "failed";
    };

/**
 * Public like counts for discovery (track_like_counts view, with fallback).
 */
export async function loadLikeCountMap(
  supabase: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = [...new Set(trackIds.filter(Boolean))];
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from("track_like_counts")
    .select("track_id, like_count")
    .in("track_id", ids);

  if (!error && data) {
    for (const row of data) {
      map.set(row.track_id as string, Number(row.like_count) || 0);
    }
    return map;
  }

  // Fallback: count from track_likes (may be RLS-limited to own likes)
  const { data: likes, error: likeError } = await supabase
    .from("track_likes")
    .select("track_id")
    .in("track_id", ids);

  if (likeError || !likes) return map;
  for (const row of likes) {
    const tid = row.track_id as string;
    map.set(tid, (map.get(tid) ?? 0) + 1);
  }
  return map;
}

export async function loadTrackLikeCount(
  supabase: SupabaseClient,
  trackId: string,
): Promise<{ count: number; missingView: boolean }> {
  const map = await loadLikeCountMap(supabase, [trackId]);
  if (map.has(trackId)) {
    return { count: map.get(trackId) ?? 0, missingView: false };
  }

  const { error } = await supabase
    .from("track_like_counts")
    .select("track_id")
    .eq("track_id", trackId)
    .maybeSingle();

  if (error && isMissingRelation(error.message)) {
    return { count: 0, missingView: true };
  }
  return { count: 0, missingView: false };
}

export async function toggleTrackLike(
  supabase: SupabaseClient,
  trackId: string,
): Promise<ToggleLikeResult> {
  const id = trackId.trim();
  if (!id) {
    return { ok: false, error: "track_id is required", code: "failed" };
  }

  const { data, error } = await supabase.rpc("toggle_track_like", {
    p_track_id: id,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return toggleTrackLikeFallback(supabase, id);
    }
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as { liked?: boolean; track_id?: string } | null;
  return {
    ok: true,
    liked: Boolean(row?.liked),
    track_id: typeof row?.track_id === "string" ? row.track_id : id,
  };
}

async function toggleTrackLikeFallback(
  supabase: SupabaseClient,
  trackId: string,
): Promise<ToggleLikeResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required", code: "not_authenticated" };
  }

  const { data: existing, error: readError } = await supabase
    .from("track_likes")
    .select("track_id")
    .eq("user_id", user.id)
    .eq("track_id", trackId)
    .maybeSingle();

  if (readError) {
    if (isMissingRelation(readError.message)) {
      return {
        ok: false,
        error: "Run track likes SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: readError.message, code: "failed" };
  }

  if (existing) {
    const { error: delError } = await supabase
      .from("track_likes")
      .delete()
      .eq("user_id", user.id)
      .eq("track_id", trackId);
    if (delError) {
      return { ok: false, error: delError.message, code: "failed" };
    }
    return { ok: true, liked: false, track_id: trackId };
  }

  const { error: insError } = await supabase.from("track_likes").insert({
    user_id: user.id,
    track_id: trackId,
  });
  if (insError) {
    if (isMissingRelation(insError.message)) {
      return {
        ok: false,
        error: "Run track likes SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: insError.message, code: "failed" };
  }
  return { ok: true, liked: true, track_id: trackId };
}

export async function isTrackLiked(
  supabase: SupabaseClient,
  userId: string,
  trackId: string,
): Promise<
  | { ok: true; liked: boolean }
  | { ok: false; error: string; code?: "missing_table" | "failed" }
> {
  const id = trackId.trim();
  if (!id) {
    return { ok: false, error: "track_id is required", code: "failed" };
  }

  const { data, error } = await supabase
    .from("track_likes")
    .select("track_id")
    .eq("user_id", userId)
    .eq("track_id", id)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run track likes SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  return { ok: true, liked: Boolean(data) };
}

export async function clearAllLikes(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  | { ok: true; deleted: number }
  | { ok: false; error: string; code?: "missing_table" | "failed" }
> {
  const { data, error } = await supabase
    .from("track_likes")
    .delete()
    .eq("user_id", userId)
    .select("track_id");

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run track likes SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  return { ok: true, deleted: data?.length ?? 0 };
}

export type TrackLiker = {
  id: string;
  display_name: string;
  liked_at: string | null;
};

export type TrackLikersResult = {
  likers: TrackLiker[];
  missingTable: boolean;
  error: string | null;
};

/**
 * People who liked a track — only works for the track owner (RLS).
 */
export async function loadTrackLikers(
  supabase: SupabaseClient,
  trackId: string,
  limit = 40,
): Promise<TrackLikersResult> {
  const id = trackId.trim();
  if (!id) {
    return { likers: [], missingTable: false, error: "track_id required" };
  }

  try {
    const { data: rows, error } = await supabase
      .from("track_likes")
      .select("user_id, created_at")
      .eq("track_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { likers: [], missingTable: true, error: null };
      }
      return { likers: [], missingTable: false, error: error.message };
    }

    return mapLikerRows(supabase, rows ?? []);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load likers";
    return {
      likers: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

/**
 * People you follow who liked this track (privacy_show_likes via RLS).
 */
export async function loadFriendsWhoLikedTrack(
  supabase: SupabaseClient,
  viewerId: string,
  trackId: string,
  limit = 12,
): Promise<TrackLikersResult> {
  const id = trackId.trim();
  if (!viewerId || !id) {
    return { likers: [], missingTable: false, error: null };
  }

  try {
    const { data: follows, error: followError } = await supabase
      .from("people_follows")
      .select("person_id")
      .eq("follower_id", viewerId)
      .limit(80);

    if (followError) {
      if (isMissingRelation(followError.message)) {
        return { likers: [], missingTable: true, error: null };
      }
      return { likers: [], missingTable: false, error: followError.message };
    }

    const personIds = (follows ?? [])
      .map((r) => r.person_id as string)
      .filter(Boolean);
    if (personIds.length === 0) {
      return { likers: [], missingTable: false, error: null };
    }

    const { data: rows, error } = await supabase
      .from("track_likes")
      .select("user_id, created_at")
      .eq("track_id", id)
      .in("user_id", personIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { likers: [], missingTable: true, error: null };
      }
      return { likers: [], missingTable: false, error: error.message };
    }

    return mapLikerRows(supabase, rows ?? []);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Failed to load friends who liked";
    return {
      likers: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

export type RecentTrackLike = TrackLiker & {
  track_id: string;
  track_title: string;
};

export type ArtistRecentLikesResult = {
  likes: RecentTrackLike[];
  missingTable: boolean;
  error: string | null;
};

/**
 * Recent likes across an artist's catalog (studio roster).
 */
export async function loadArtistRecentLikes(
  supabase: SupabaseClient,
  artistId: string,
  limit = 30,
): Promise<ArtistRecentLikesResult> {
  try {
    const { data: tracks, error: trackError } = await supabase
      .from("tracks")
      .select("id, title")
      .eq("artist_id", artistId)
      .limit(200);

    if (trackError) {
      if (isMissingRelation(trackError.message)) {
        return { likes: [], missingTable: true, error: null };
      }
      return { likes: [], missingTable: false, error: trackError.message };
    }

    const trackRows = (tracks ?? []).filter(
      (t) => t.id && !isDemoTrack(t as TrackRow),
    );
    if (trackRows.length === 0) {
      return { likes: [], missingTable: false, error: null };
    }

    const titleById = new Map(
      trackRows.map((t) => [
        t.id as string,
        typeof t.title === "string" && t.title.trim()
          ? t.title.trim()
          : "Track",
      ]),
    );
    const trackIds = trackRows.map((t) => t.id as string);

    const { data: rows, error } = await supabase
      .from("track_likes")
      .select("user_id, track_id, created_at")
      .in("track_id", trackIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { likes: [], missingTable: true, error: null };
      }
      return { likes: [], missingTable: false, error: error.message };
    }

    const likeRows = rows ?? [];
    if (likeRows.length === 0) {
      return { likes: [], missingTable: false, error: null };
    }

    const mapped = await mapLikerRows(
      supabase,
      likeRows.map((r) => ({
        user_id: r.user_id,
        created_at: r.created_at,
      })),
    );

    if (mapped.missingTable || mapped.error) {
      return {
        likes: [],
        missingTable: mapped.missingTable,
        error: mapped.error,
      };
    }

    const nameById = new Map(mapped.likers.map((l) => [l.id, l.display_name]));
    const likes: RecentTrackLike[] = [];
    for (const r of likeRows) {
      const uid = r.user_id as string;
      const tid = r.track_id as string;
      if (!uid || !tid) continue;
      likes.push({
        id: uid,
        display_name: nameById.get(uid) ?? "Listener",
        liked_at: (r.created_at as string | null) ?? null,
        track_id: tid,
        track_title: titleById.get(tid) ?? "Track",
      });
    }

    return { likes, missingTable: false, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load recent likes";
    return {
      likes: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

async function mapLikerRows(
  supabase: SupabaseClient,
  rows: { user_id?: unknown; created_at?: unknown }[],
): Promise<TrackLikersResult> {
  if (rows.length === 0) {
    return { likers: [], missingTable: false, error: null };
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  const atById = new Map<string, string | null>();
  for (const r of rows) {
    const uid = r.user_id as string;
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    ids.push(uid);
    atById.set(uid, (r.created_at as string | null) ?? null);
  }

  if (ids.length === 0) {
    return { likers: [], missingTable: false, error: null };
  }

  // Admin read: likers are often listeners; RLS may hide display_name.
  const admin = createAdminClient();
  const db = admin ?? supabase;

  const { data: users, error: userError } = await db
    .from("users")
    .select("id, display_name, privacy_public_profile")
    .in("id", ids);

  if (
    userError &&
    /privacy_public_profile|column .* does not exist/i.test(userError.message)
  ) {
    const lean = await db
      .from("users")
      .select("id, display_name")
      .in("id", ids);
    if (lean.error) {
      return {
        likers: [],
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
      likers: ids.map((id) => ({
        id,
        display_name: byId.get(id) ?? "Listener",
        liked_at: atById.get(id) ?? null,
      })),
      missingTable: false,
      error: null,
    };
  }

  if (userError) {
    return {
      likers: [],
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
    likers: ids.map((id) => ({
      id,
      display_name: byId.get(id) ?? "Listener",
      liked_at: atById.get(id) ?? null,
    })),
    missingTable: false,
    error: null,
  };
}
