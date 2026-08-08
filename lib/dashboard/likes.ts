import type { SupabaseClient } from "@supabase/supabase-js";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { isDemoTrack, type TrackRow } from "@/lib/tracks";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
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

    return { tracks, missingTable: false, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load liked tracks";
    return {
      tracks: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
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
