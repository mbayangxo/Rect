import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlaylistSummary } from "@/lib/dashboard/playlists";
import { isProfilePublic } from "@/lib/dashboard/privacy";
import { createAdminClient } from "@/lib/supabase/admin";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type FollowedPlaylist = PlaylistSummary & {
  owner_id: string;
  owner_name: string;
  followed_at: string | null;
};

export type PlaylistSaver = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  saved_at: string | null;
};

export async function loadPlaylistFollowerCount(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{ count: number; missingTable: boolean }> {
  const id = playlistId.trim();
  if (!id) return { count: 0, missingTable: false };

  try {
    const rpc = await supabase.rpc("playlist_save_count", {
      p_playlist_id: id,
    });

    if (!rpc.error) {
      return { count: Number(rpc.data) || 0, missingTable: false };
    }

    // Older DBs without RPC — table count (needs select policy)
    if (
      !/playlist_save_count|function .* does not exist|PGRST202/i.test(
        rpc.error.message,
      ) &&
      isMissingRelation(rpc.error.message)
    ) {
      return { count: 0, missingTable: true };
    }

    const { count, error: countError } = await supabase
      .from("playlist_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("playlist_id", id);

    if (countError) {
      if (isMissingRelation(countError.message)) {
        return { count: 0, missingTable: true };
      }
      return { count: 0, missingTable: false };
    }
    return { count: count ?? 0, missingTable: false };
  } catch {
    return { count: 0, missingTable: false };
  }
}

export async function loadIsFollowingPlaylist(
  supabase: SupabaseClient,
  followerId: string,
  playlistId: string,
): Promise<{ following: boolean; missingTable: boolean }> {
  try {
    const { data, error } = await supabase
      .from("playlist_follows")
      .select("playlist_id")
      .eq("follower_id", followerId)
      .eq("playlist_id", playlistId)
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

/** Which of `playlistIds` the viewer already follows (batch). */
export async function loadFollowingAmongPlaylists(
  supabase: SupabaseClient,
  followerId: string,
  playlistIds: string[],
): Promise<{ followingIds: string[]; missingTable: boolean }> {
  const unique = [...new Set(playlistIds.filter(Boolean))];
  if (unique.length === 0) {
    return { followingIds: [], missingTable: false };
  }

  try {
    const { data, error } = await supabase
      .from("playlist_follows")
      .select("playlist_id")
      .eq("follower_id", followerId)
      .in("playlist_id", unique);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { followingIds: [], missingTable: true };
      }
      return { followingIds: [], missingTable: false };
    }

    return {
      followingIds: (data ?? [])
        .map((r) => r.playlist_id as string)
        .filter(Boolean),
      missingTable: false,
    };
  } catch {
    return { followingIds: [], missingTable: false };
  }
}

export type TogglePlaylistFollowResult =
  | {
      ok: true;
      following: boolean;
      playlist_id: string;
      follower_count: number;
    }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "cannot_follow_own"
        | "playlist_private"
        | "playlist_not_found"
        | "blocked"
        | "missing_table"
        | "failed";
    };

export async function togglePlaylistFollow(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<TogglePlaylistFollowResult> {
  const id = playlistId.trim();
  if (!id) {
    return { ok: false, error: "playlist_id is required", code: "failed" };
  }

  const { data, error } = await supabase.rpc("toggle_playlist_follow", {
    p_playlist_id: id,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return togglePlaylistFollowFallback(supabase, id);
    }
    if (/not_authenticated/i.test(error.message)) {
      return {
        ok: false,
        error: "Sign in required",
        code: "not_authenticated",
      };
    }
    if (/cannot_follow_own/i.test(error.message)) {
      return {
        ok: false,
        error: "You already own this playlist",
        code: "cannot_follow_own",
      };
    }
    if (/playlist_private/i.test(error.message)) {
      return {
        ok: false,
        error: "Only public playlists can be saved",
        code: "playlist_private",
      };
    }
    if (/playlist_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Playlist not found",
        code: "playlist_not_found",
      };
    }
    if (/blocked/i.test(error.message)) {
      return {
        ok: false,
        error: "You can’t save this mix",
        code: "blocked",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as Record<string, unknown> | null;
  return {
    ok: true,
    following: Boolean(row?.following),
    playlist_id: typeof row?.playlist_id === "string" ? row.playlist_id : id,
    follower_count: Number(row?.follower_count) || 0,
  };
}

async function togglePlaylistFollowFallback(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<TogglePlaylistFollowResult> {
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

  const { data: pl, error: plError } = await supabase
    .from("playlists")
    .select("id, user_id, is_public")
    .eq("id", playlistId)
    .maybeSingle();

  if (plError) {
    if (isMissingRelation(plError.message)) {
      return {
        ok: false,
        error: "Run playlist follows SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: plError.message, code: "failed" };
  }
  if (!pl) {
    return {
      ok: false,
      error: "Playlist not found",
      code: "playlist_not_found",
    };
  }
  if ((pl.user_id as string) === user.id) {
    return {
      ok: false,
      error: "You already own this playlist",
      code: "cannot_follow_own",
    };
  }

  const { data: existing, error: existError } = await supabase
    .from("playlist_follows")
    .select("playlist_id")
    .eq("follower_id", user.id)
    .eq("playlist_id", playlistId)
    .maybeSingle();

  if (existError) {
    if (isMissingRelation(existError.message)) {
      return {
        ok: false,
        error: "Run playlist follows SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: existError.message, code: "failed" };
  }

  if (existing) {
    const { error: delError } = await supabase
      .from("playlist_follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("playlist_id", playlistId);
    if (delError) {
      return { ok: false, error: delError.message, code: "failed" };
    }
  } else {
    if (!pl.is_public) {
      return {
        ok: false,
        error: "Only public playlists can be saved",
        code: "playlist_private",
      };
    }
    try {
      const { data: blocked } = await supabase.rpc("users_are_blocked", {
        p_a: user.id,
        p_b: pl.user_id as string,
      });
      if (blocked === true) {
        return {
          ok: false,
          error: "You can’t save this mix",
          code: "blocked",
        };
      }
    } catch {
      // allow when RPC missing
    }
    const { error: insError } = await supabase.from("playlist_follows").insert({
      follower_id: user.id,
      playlist_id: playlistId,
    });
    if (insError) {
      if (isMissingRelation(insError.message)) {
        return {
          ok: false,
          error: "Run playlist follows SQL in Supabase first",
          code: "missing_table",
        };
      }
      return { ok: false, error: insError.message, code: "failed" };
    }
  }

  const countRes = await loadPlaylistFollowerCount(supabase, playlistId);
  return {
    ok: true,
    following: !existing,
    playlist_id: playlistId,
    follower_count: countRes.count,
  };
}

export async function notifyPlaylistFollow(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{ ok: boolean; skipped?: string; missingTable?: boolean }> {
  const { data, error } = await supabase.rpc("notify_playlist_follow", {
    p_playlist_id: playlistId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, missingTable: true };
    }
    return { ok: false };
  }

  const row = data as { skipped?: string } | null;
  return {
    ok: true,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

/** Soft-notify original owner when someone copies their public mix. */
export async function notifyPlaylistCopy(
  supabase: SupabaseClient,
  sourcePlaylistId: string,
  copyPlaylistId?: string | null,
): Promise<{ ok: boolean; skipped?: string; missingTable?: boolean }> {
  const copyId =
    typeof copyPlaylistId === "string" && copyPlaylistId.trim()
      ? copyPlaylistId.trim()
      : null;

  if (copyId) {
    const { data, error } = await supabase.rpc("notify_playlist_copy", {
      p_source_id: sourcePlaylistId,
      p_copy_id: copyId,
    });

    if (!error) {
      const row = data as { skipped?: string } | null;
      return {
        ok: true,
        skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
      };
    }

    // Older 1-arg notify still live — fall through
    if (
      !/Could not find the function|PGRST202|p_source_id|p_copy_id|related_playlist_id/i.test(
        error.message,
      ) &&
      !isMissingRelation(error.message)
    ) {
      return { ok: false };
    }
    if (isMissingRelation(error.message) && !/p_copy_id|p_source_id/i.test(error.message)) {
      return { ok: false, missingTable: true };
    }
  }

  const { data, error } = await supabase.rpc("notify_playlist_copy", {
    p_playlist_id: sourcePlaylistId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, missingTable: true };
    }
    return { ok: false };
  }

  const row = data as { skipped?: string } | null;
  return {
    ok: true,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

export async function loadFollowedPlaylists(
  supabase: SupabaseClient,
  userId: string,
  limit = 40,
): Promise<{
  playlists: FollowedPlaylist[];
  missingTable: boolean;
  error: string | null;
}> {
  try {
    const { data: follows, error } = await supabase
      .from("playlist_follows")
      .select("playlist_id, created_at")
      .eq("follower_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { playlists: [], missingTable: true, error: null };
      }
      return { playlists: [], missingTable: false, error: error.message };
    }

    const rows = follows ?? [];
    if (rows.length === 0) {
      return { playlists: [], missingTable: false, error: null };
    }

    const ids = rows.map((r) => r.playlist_id as string).filter(Boolean);
    const followedAt = new Map(
      rows.map((r) => [
        r.playlist_id as string,
        (r.created_at as string | null) ?? null,
      ]),
    );

    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data: pls, error: plError } = await db
      .from("playlists")
      .select(
        "id, name, description, cover_art_url, created_at, updated_at, is_public, user_id",
      )
      .in("id", ids)
      .eq("is_public", true);

    if (plError) {
      return { playlists: [], missingTable: false, error: plError.message };
    }

    const playlistRows = pls ?? [];
    if (playlistRows.length === 0) {
      return { playlists: [], missingTable: false, error: null };
    }

    const countById = new Map<string, number>();
    const { data: trackRows } = await db
      .from("playlist_tracks")
      .select("playlist_id")
      .in(
        "playlist_id",
        playlistRows.map((p) => p.id as string),
      );
    for (const row of trackRows ?? []) {
      const pid = row.playlist_id as string;
      countById.set(pid, (countById.get(pid) ?? 0) + 1);
    }

    const ownerIds = [
      ...new Set(
        playlistRows.map((p) => p.user_id as string).filter(Boolean),
      ),
    ];
    const nameById = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: owners } = await db
        .from("users")
        .select("id, display_name, privacy_public_profile")
        .in("id", ownerIds);
      for (const u of owners ?? []) {
        const publicOk =
          (u as { privacy_public_profile?: boolean | null })
            .privacy_public_profile !== false;
        const name =
          publicOk &&
          typeof u.display_name === "string" &&
          u.display_name.trim()
            ? u.display_name.trim()
            : "Listener";
        nameById.set(u.id as string, name);
      }
    }

    const byId = new Map(playlistRows.map((p) => [p.id as string, p]));
    const playlists: FollowedPlaylist[] = [];
    for (const id of ids) {
      const p = byId.get(id);
      if (!p) continue;
      const ownerId = p.user_id as string;
      playlists.push({
        id: id,
        name: ((p.name as string) ?? "").trim() || "Playlist",
        description:
          typeof p.description === "string" && p.description.trim()
            ? p.description.trim().slice(0, 280)
            : null,
        cover_art_url:
          typeof p.cover_art_url === "string" && p.cover_art_url.trim()
            ? p.cover_art_url.trim()
            : null,
        created_at: (p.created_at as string | null) ?? null,
        updated_at: (p.updated_at as string | null) ?? null,
        track_count: countById.get(id) ?? 0,
        is_public: true,
        pinned_at: null,
        owner_id: ownerId,
        owner_name: nameById.get(ownerId) ?? "Listener",
        followed_at: followedAt.get(id) ?? null,
      });
    }

    return { playlists, missingTable: false, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load saved playlists";
    return {
      playlists: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

/**
 * Public profile: public mixes this person saved (opt-in privacy_show_saves).
 */
export async function loadPublicSavedPlaylists(
  supabase: SupabaseClient,
  personId: string,
  limit = 12,
): Promise<{
  playlists: FollowedPlaylist[];
  sharing: boolean;
  missingColumn: boolean;
  missingTable: boolean;
  error: string | null;
}> {
  const id = personId.trim();
  if (!id) {
    return {
      playlists: [],
      sharing: false,
      missingColumn: false,
      missingTable: false,
      error: null,
    };
  }

  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const full = await db
      .from("users")
      .select("privacy_public_profile, privacy_show_saves")
      .eq("id", id)
      .maybeSingle();

    if (
      full.error &&
      /privacy_show_saves|column .* does not exist/i.test(full.error.message)
    ) {
      return {
        playlists: [],
        sharing: false,
        missingColumn: true,
        missingTable: false,
        error: null,
      };
    }
    if (full.error) {
      return {
        playlists: [],
        sharing: false,
        missingColumn: false,
        missingTable: false,
        error: full.error.message,
      };
    }

    const publicOk = isProfilePublic({
      privacy_public_profile: full.data?.privacy_public_profile ?? true,
    });
    const showSaves = full.data?.privacy_show_saves === true;
    if (!publicOk || !showSaves) {
      return {
        playlists: [],
        sharing: false,
        missingColumn: false,
        missingTable: false,
        error: null,
      };
    }

    let followRows: { playlist_id: string; created_at: string | null }[] = [];

    const rpc = await supabase.rpc("person_saved_public_playlists", {
      p_person_id: id,
      p_limit: limit,
    });

    if (!rpc.error) {
      followRows = ((rpc.data ?? []) as {
        playlist_id?: string;
        followed_at?: string | null;
      }[])
        .map((r) => ({
          playlist_id: typeof r.playlist_id === "string" ? r.playlist_id : "",
          created_at: r.followed_at ?? null,
        }))
        .filter((r) => r.playlist_id);
    } else if (!isMissingRelation(rpc.error.message)) {
      return {
        playlists: [],
        sharing: true,
        missingColumn: false,
        missingTable: false,
        error: rpc.error.message,
      };
    } else {
      const { data: follows, error } = await db
        .from("playlist_follows")
        .select("playlist_id, created_at")
        .eq("follower_id", id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        if (isMissingRelation(error.message)) {
          return {
            playlists: [],
            sharing: true,
            missingColumn: false,
            missingTable: true,
            error: null,
          };
        }
        return {
          playlists: [],
          sharing: true,
          missingColumn: false,
          missingTable: false,
          error: error.message,
        };
      }
      followRows = (follows ?? []).map((r) => ({
        playlist_id: r.playlist_id as string,
        created_at: (r.created_at as string | null) ?? null,
      }));
    }

    if (followRows.length === 0) {
      return {
        playlists: [],
        sharing: true,
        missingColumn: false,
        missingTable: false,
        error: null,
      };
    }

    const ids = followRows.map((r) => r.playlist_id).filter(Boolean);
    const followedAt = new Map(
      followRows.map((r) => [r.playlist_id, r.created_at]),
    );

    const { data: pls, error: plError } = await db
      .from("playlists")
      .select(
        "id, name, description, cover_art_url, created_at, updated_at, is_public, user_id",
      )
      .in("id", ids)
      .eq("is_public", true);

    if (plError) {
      return {
        playlists: [],
        sharing: true,
        missingColumn: false,
        missingTable: false,
        error: plError.message,
      };
    }

    const playlistRows = pls ?? [];
    if (playlistRows.length === 0) {
      return {
        playlists: [],
        sharing: true,
        missingColumn: false,
        missingTable: false,
        error: null,
      };
    }

    const countById = new Map<string, number>();
    const { data: trackRows } = await db
      .from("playlist_tracks")
      .select("playlist_id")
      .in(
        "playlist_id",
        playlistRows.map((p) => p.id as string),
      );
    for (const row of trackRows ?? []) {
      const pid = row.playlist_id as string;
      countById.set(pid, (countById.get(pid) ?? 0) + 1);
    }

    const ownerIds = [
      ...new Set(
        playlistRows.map((p) => p.user_id as string).filter(Boolean),
      ),
    ];
    const nameById = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: owners } = await db
        .from("users")
        .select("id, display_name, privacy_public_profile")
        .in("id", ownerIds);
      for (const u of owners ?? []) {
        const publicOk =
          (u as { privacy_public_profile?: boolean | null })
            .privacy_public_profile !== false;
        const name =
          publicOk &&
          typeof u.display_name === "string" &&
          u.display_name.trim()
            ? u.display_name.trim()
            : "Listener";
        nameById.set(u.id as string, name);
      }
    }

    const byId = new Map(playlistRows.map((p) => [p.id as string, p]));
    const playlists: FollowedPlaylist[] = [];
    for (const pid of ids) {
      const p = byId.get(pid);
      if (!p) continue;
      const ownerId = p.user_id as string;
      playlists.push({
        id: pid,
        name: ((p.name as string) ?? "").trim() || "Playlist",
        description:
          typeof p.description === "string" && p.description.trim()
            ? p.description.trim().slice(0, 280)
            : null,
        cover_art_url:
          typeof p.cover_art_url === "string" && p.cover_art_url.trim()
            ? p.cover_art_url.trim()
            : null,
        created_at: (p.created_at as string | null) ?? null,
        updated_at: (p.updated_at as string | null) ?? null,
        track_count: countById.get(pid) ?? 0,
        is_public: true,
        pinned_at: null,
        owner_id: ownerId,
        owner_name: nameById.get(ownerId) ?? "Listener",
        followed_at: followedAt.get(pid) ?? null,
      });
    }

    return {
      playlists,
      sharing: true,
      missingColumn: false,
      missingTable: false,
      error: null,
    };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Failed to load saved playlists";
    return {
      playlists: [],
      sharing: false,
      missingColumn: false,
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

/**
 * People you follow who saved this mix (RPC — does not expose full roster).
 */
export async function loadFriendsWhoSavedPlaylist(
  supabase: SupabaseClient,
  viewerId: string,
  playlistId: string,
  limit = 12,
): Promise<{
  savers: PlaylistSaver[];
  missingTable: boolean;
  error: string | null;
}> {
  const id = playlistId.trim();
  if (!viewerId || !id) {
    return { savers: [], missingTable: false, error: null };
  }

  try {
    const { data, error } = await supabase.rpc("friends_who_saved_playlist", {
      p_playlist_id: id,
      p_limit: limit,
    });

    if (error) {
      if (isMissingRelation(error.message)) {
        return { savers: [], missingTable: true, error: null };
      }
      return { savers: [], missingTable: false, error: error.message };
    }

    const rows = (data ?? []) as {
      user_id?: string;
      saved_at?: string | null;
    }[];

    const ids: string[] = [];
    const seen = new Set<string>();
    const atById = new Map<string, string | null>();
    for (const r of rows) {
      const uid = typeof r.user_id === "string" ? r.user_id : "";
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      ids.push(uid);
      atById.set(uid, r.saved_at ?? null);
    }

    if (ids.length === 0) {
      return { savers: [], missingTable: false, error: null };
    }

    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data: users, error: userError } = await db
      .from("users")
      .select("id, display_name, avatar_url, privacy_public_profile")
      .in("id", ids);

    if (
      userError &&
      /avatar_url|privacy_public_profile|column .* does not exist/i.test(
        userError.message,
      )
    ) {
      const lean = await db
        .from("users")
        .select("id, display_name, privacy_public_profile")
        .in("id", ids);
      if (lean.error) {
        return { savers: [], missingTable: false, error: lean.error.message };
      }
      const byId = new Map(
        (lean.data ?? []).map((u) => {
          const publicOk = isProfilePublic(
            u as { privacy_public_profile?: boolean | null },
          );
          const name =
            publicOk &&
            typeof u.display_name === "string" &&
            u.display_name.trim()
              ? u.display_name.trim()
              : "Listener";
          return [u.id as string, { name, avatar: null as string | null }] as const;
        }),
      );
      return {
        savers: ids.map((uid) => ({
          id: uid,
          display_name: byId.get(uid)?.name ?? "Listener",
          avatar_url: null,
          saved_at: atById.get(uid) ?? null,
        })),
        missingTable: false,
        error: null,
      };
    }

    if (userError) {
      return { savers: [], missingTable: false, error: userError.message };
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
        const avatar =
          publicOk &&
          typeof u.avatar_url === "string" &&
          u.avatar_url.trim()
            ? u.avatar_url.trim()
            : null;
        return [u.id as string, { name, avatar }] as const;
      }),
    );

    return {
      savers: ids.map((uid) => ({
        id: uid,
        display_name: byId.get(uid)?.name ?? "Listener",
        avatar_url: byId.get(uid)?.avatar ?? null,
        saved_at: atById.get(uid) ?? null,
      })),
      missingTable: false,
      error: null,
    };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Failed to load friends who saved";
    return {
      savers: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

/**
 * Who saved this playlist — owner-only via RLS (select_as_owner).
 */
export async function loadPlaylistFollowers(
  supabase: SupabaseClient,
  playlistId: string,
  limit = 40,
): Promise<{
  savers: PlaylistSaver[];
  missingTable: boolean;
  error: string | null;
}> {
  const id = playlistId.trim();
  if (!id) {
    return { savers: [], missingTable: false, error: "playlist_id required" };
  }

  try {
    const { data: rows, error } = await supabase
      .from("playlist_follows")
      .select("follower_id, created_at")
      .eq("playlist_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { savers: [], missingTable: true, error: null };
      }
      return { savers: [], missingTable: false, error: error.message };
    }

    const followRows = rows ?? [];
    if (followRows.length === 0) {
      return { savers: [], missingTable: false, error: null };
    }

    const ids: string[] = [];
    const seen = new Set<string>();
    const atById = new Map<string, string | null>();
    for (const r of followRows) {
      const uid = r.follower_id as string;
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      ids.push(uid);
      atById.set(uid, (r.created_at as string | null) ?? null);
    }

    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data: users, error: userError } = await db
      .from("users")
      .select("id, display_name, avatar_url, privacy_public_profile")
      .in("id", ids);

    if (
      userError &&
      /avatar_url|privacy_public_profile|column .* does not exist/i.test(
        userError.message,
      )
    ) {
      const lean = await db
        .from("users")
        .select("id, display_name, privacy_public_profile")
        .in("id", ids);
      if (lean.error) {
        return { savers: [], missingTable: false, error: lean.error.message };
      }
      const byId = new Map(
        (lean.data ?? []).map((u) => {
          const publicOk = isProfilePublic(
            u as { privacy_public_profile?: boolean | null },
          );
          const name =
            publicOk &&
            typeof u.display_name === "string" &&
            u.display_name.trim()
              ? u.display_name.trim()
              : "Listener";
          return [u.id as string, { name, avatar: null as string | null }] as const;
        }),
      );
      return {
        savers: ids.map((uid) => ({
          id: uid,
          display_name: byId.get(uid)?.name ?? "Listener",
          avatar_url: null,
          saved_at: atById.get(uid) ?? null,
        })),
        missingTable: false,
        error: null,
      };
    }

    if (userError) {
      return { savers: [], missingTable: false, error: userError.message };
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
        const avatar =
          publicOk &&
          typeof u.avatar_url === "string" &&
          u.avatar_url.trim()
            ? u.avatar_url.trim()
            : null;
        return [u.id as string, { name, avatar }] as const;
      }),
    );

    return {
      savers: ids.map((uid) => ({
        id: uid,
        display_name: byId.get(uid)?.name ?? "Listener",
        avatar_url: byId.get(uid)?.avatar ?? null,
        saved_at: atById.get(uid) ?? null,
      })),
      missingTable: false,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load savers";
    return {
      savers: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

export type OwnerRecentMixSaver = {
  follower_id: string;
  display_name: string;
  playlist_id: string;
  playlist_title: string;
  saved_at: string | null;
};

export type OwnerRecentMixSaversResult = {
  savers: OwnerRecentMixSaver[];
  missingTable: boolean;
  error: string | null;
};

/**
 * Recent saves across mixes the user owns (studio rollup).
 * Relies on playlist_follows_select_as_owner RLS.
 */
export async function loadOwnerRecentMixSavers(
  supabase: SupabaseClient,
  ownerId: string,
  limit = 24,
): Promise<OwnerRecentMixSaversResult> {
  try {
    const { data: playlists, error: playlistError } = await supabase
      .from("playlists")
      .select("id, name")
      .eq("user_id", ownerId)
      .limit(200);

    if (playlistError) {
      if (isMissingRelation(playlistError.message)) {
        return { savers: [], missingTable: true, error: null };
      }
      return {
        savers: [],
        missingTable: false,
        error: playlistError.message,
      };
    }

    const playlistRows = (playlists ?? []).filter((p) => p.id);
    if (playlistRows.length === 0) {
      return { savers: [], missingTable: false, error: null };
    }

    const titleById = new Map(
      playlistRows.map((p) => [
        p.id as string,
        typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Mix",
      ]),
    );
    const playlistIds = playlistRows.map((p) => p.id as string);

    const { data: rows, error } = await supabase
      .from("playlist_follows")
      .select("follower_id, playlist_id, created_at")
      .in("playlist_id", playlistIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { savers: [], missingTable: true, error: null };
      }
      return { savers: [], missingTable: false, error: error.message };
    }

    const followRows = (rows ?? []).filter(
      (r) => r.follower_id && r.playlist_id,
    );
    if (followRows.length === 0) {
      return { savers: [], missingTable: false, error: null };
    }

    const userIds = [
      ...new Set(
        followRows.map((r) => r.follower_id as string).filter(Boolean),
      ),
    ];

    const admin = createAdminClient();
    const db = admin ?? supabase;
    const nameById = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: users, error: userError } = await db
        .from("users")
        .select("id, display_name, privacy_public_profile")
        .in("id", userIds);

      if (
        userError &&
        /privacy_public_profile|column .* does not exist/i.test(
          userError.message,
        )
      ) {
        const lean = await db
          .from("users")
          .select("id, display_name")
          .in("id", userIds);
        for (const u of lean.data ?? []) {
          const name =
            typeof u.display_name === "string" ? u.display_name.trim() : "";
          nameById.set(String(u.id), name || "Listener");
        }
      } else if (!userError) {
        for (const u of users ?? []) {
          const publicOk = isProfilePublic(
            u as { privacy_public_profile?: boolean | null },
          );
          const name =
            publicOk &&
            typeof u.display_name === "string" &&
            u.display_name.trim()
              ? u.display_name.trim()
              : "Listener";
          nameById.set(String(u.id), name);
        }
      }
    }

    const savers: OwnerRecentMixSaver[] = [];
    for (const r of followRows) {
      const uid = String(r.follower_id);
      const pid = String(r.playlist_id);
      if (!uid || !pid) continue;
      savers.push({
        follower_id: uid,
        display_name: nameById.get(uid) ?? "Listener",
        playlist_id: pid,
        playlist_title: titleById.get(pid) ?? "Mix",
        saved_at: (r.created_at as string | null) ?? null,
      });
    }

    return { savers, missingTable: false, error: null };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Failed to load mix savers";
    return {
      savers: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}



export const PLAYLIST_FOLLOW_THANKS_MAX = 280;

export async function sendPlaylistFollowThanks(
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
        | "not_a_playlist_follow"
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
  if (!message || message.length > PLAYLIST_FOLLOW_THANKS_MAX) {
    return {
      ok: false,
      error: `Thanks must be 1–${PLAYLIST_FOLLOW_THANKS_MAX} characters`,
      code: "invalid_message",
    };
  }

  const { data, error } = await supabase.rpc("send_playlist_follow_thanks", {
    p_notification_id: notificationId,
    p_message: message,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlist follow thanks SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/notification_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Save notification not found",
        code: "notification_not_found",
      };
    }
    if (/not_recipient/i.test(error.message)) {
      return {
        ok: false,
        error: "Only the mix owner can thank",
        code: "not_recipient",
      };
    }
    if (/not_a_playlist_follow/i.test(error.message)) {
      return {
        ok: false,
        error: "Not a playlist save notification",
        code: "not_a_playlist_follow",
      };
    }
    if (/already_thanked/i.test(error.message)) {
      return {
        ok: false,
        error: "You already thanked for this save",
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

export const PLAYLIST_COPY_THANKS_MAX = 280;

export async function sendPlaylistCopyThanks(
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
        | "not_a_playlist_copy"
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
  if (!message || message.length > PLAYLIST_COPY_THANKS_MAX) {
    return {
      ok: false,
      error: `Thanks must be 1–${PLAYLIST_COPY_THANKS_MAX} characters`,
      code: "invalid_message",
    };
  }

  const { data, error } = await supabase.rpc("send_playlist_copy_thanks", {
    p_notification_id: notificationId,
    p_message: message,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlist copy thanks SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/notification_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Copy notification not found",
        code: "notification_not_found",
      };
    }
    if (/not_recipient/i.test(error.message)) {
      return {
        ok: false,
        error: "Only the mix owner can thank",
        code: "not_recipient",
      };
    }
    if (/not_a_playlist_copy/i.test(error.message)) {
      return {
        ok: false,
        error: "Not a playlist copy notification",
        code: "not_a_playlist_copy",
      };
    }
    if (/already_thanked/i.test(error.message)) {
      return {
        ok: false,
        error: "You already thanked for this copy",
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
