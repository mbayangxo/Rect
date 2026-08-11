import type { SupabaseClient } from "@supabase/supabase-js";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import type { PlaylistSummary } from "@/lib/dashboard/playlists";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type PlaylistCollaborator = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  status: "pending" | "accepted";
  created_at: string | null;
};

export type PlaylistCollabAsk = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string | null;
  notification_id: number | null;
};

export async function loadIsPlaylistCollaborator(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
): Promise<{ collaborator: boolean; pending: boolean; missingTable: boolean }> {
  try {
    const { data, error } = await supabase
      .from("playlist_collaborators")
      .select("status")
      .eq("playlist_id", playlistId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingRelation(error.message)) {
        return { collaborator: false, pending: false, missingTable: true };
      }
      return { collaborator: false, pending: false, missingTable: false };
    }

    const status = data?.status as string | undefined;
    return {
      collaborator: status === "accepted",
      pending: status === "pending",
      missingTable: false,
    };
  } catch {
    return { collaborator: false, pending: false, missingTable: false };
  }
}

export async function loadPlaylistCollaborators(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{
  collaborators: PlaylistCollaborator[];
  missingTable: boolean;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("playlist_collaborators")
      .select("user_id, status, created_at")
      .eq("playlist_id", playlistId)
      .order("created_at", { ascending: true });

    if (error) {
      if (isMissingRelation(error.message)) {
        return { collaborators: [], missingTable: true, error: null };
      }
      return { collaborators: [], missingTable: false, error: error.message };
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return { collaborators: [], missingTable: false, error: null };
    }

    const ids = rows.map((r) => r.user_id as string).filter(Boolean);
    const nameById = await loadArtistCreditMap(supabase, ids);

    const { data: users } = await supabase
      .from("users")
      .select("id, display_name, avatar_url")
      .in("id", ids);

    const byId = new Map(
      (users ?? []).map((u) => [u.id as string, u as Record<string, unknown>]),
    );

    const collaborators: PlaylistCollaborator[] = rows.map((r) => {
      const id = r.user_id as string;
      const u = byId.get(id);
      const name =
        (typeof u?.display_name === "string" && u.display_name.trim()) ||
        nameById.get(id) ||
        "Listener";
      return {
        user_id: id,
        display_name: name,
        avatar_url:
          typeof u?.avatar_url === "string" ? (u.avatar_url as string) : null,
        status: r.status === "accepted" ? "accepted" : "pending",
        created_at: (r.created_at as string | null) ?? null,
      };
    });

    return { collaborators, missingTable: false, error: null };
  } catch (e) {
    return {
      collaborators: [],
      missingTable: false,
      error: e instanceof Error ? e.message : "Failed to load collaborators",
    };
  }
}

export async function loadCollaborativePlaylists(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  playlists: PlaylistSummary[];
  missingTable: boolean;
  error: string | null;
}> {
  try {
    const { data: links, error } = await supabase
      .from("playlist_collaborators")
      .select("playlist_id")
      .eq("user_id", userId)
      .eq("status", "accepted");

    if (error) {
      if (isMissingRelation(error.message)) {
        return { playlists: [], missingTable: true, error: null };
      }
      return { playlists: [], missingTable: false, error: error.message };
    }

    const ids = [...new Set((links ?? []).map((r) => r.playlist_id as string))];
    if (ids.length === 0) {
      return { playlists: [], missingTable: false, error: null };
    }

    const { data: rows, error: plError } = await supabase
      .from("playlists")
      .select(
        "id, name, description, cover_art_url, created_at, updated_at, is_public, pinned_at",
      )
      .in("id", ids)
      .order("updated_at", { ascending: false });

    if (plError) {
      if (isMissingRelation(plError.message)) {
        return { playlists: [], missingTable: true, error: null };
      }
      return { playlists: [], missingTable: false, error: plError.message };
    }

    const list = rows ?? [];
    const countById = new Map<string, number>();
    const { data: trackRows } = await supabase
      .from("playlist_tracks")
      .select("playlist_id")
      .in("playlist_id", ids);
    for (const t of trackRows ?? []) {
      const pid = t.playlist_id as string;
      countById.set(pid, (countById.get(pid) ?? 0) + 1);
    }

    const playlists: PlaylistSummary[] = list.map((r) => ({
      id: r.id as string,
      name: ((r.name as string) ?? "").trim() || "Playlist",
      description:
        typeof r.description === "string" && r.description.trim()
          ? r.description.trim()
          : null,
      cover_art_url:
        typeof r.cover_art_url === "string" && r.cover_art_url.trim()
          ? r.cover_art_url.trim()
          : null,
      created_at: (r.created_at as string | null) ?? null,
      updated_at: (r.updated_at as string | null) ?? null,
      track_count: countById.get(r.id as string) ?? 0,
      is_public: Boolean(r.is_public),
      pinned_at: typeof r.pinned_at === "string" ? r.pinned_at : null,
      role: "collaborator" as const,
    }));

    return { playlists, missingTable: false, error: null };
  } catch (e) {
    return {
      playlists: [],
      missingTable: false,
      error: e instanceof Error ? e.message : "Failed to load collabs",
    };
  }
}

export async function invitePlaylistCollaborator(
  supabase: SupabaseClient,
  playlistId: string,
  userId: string,
): Promise<
  | { ok: true; status: string; skipped?: string }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "not_owner"
        | "not_following"
        | "missing_table"
        | "playlist_not_found"
        | "failed";
    }
> {
  const { data, error } = await supabase.rpc("invite_playlist_collaborator", {
    p_playlist_id: playlistId,
    p_user_id: userId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlist collaborators SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    if (/not_owner/i.test(error.message)) {
      return { ok: false, error: "Only the owner can invite", code: "not_owner" };
    }
    if (/not_following/i.test(error.message)) {
      return {
        ok: false,
        error: "Follow them first to invite",
        code: "not_following",
      };
    }
    if (/blocked/i.test(error.message)) {
      return {
        ok: false,
        error: "You can’t invite this person",
        code: "failed",
      };
    }
    if (/playlist_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Playlist not found",
        code: "playlist_not_found",
      };
    }
    if (/cannot_invite/i.test(error.message)) {
      return { ok: false, error: "Can’t invite that person", code: "failed" };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as { ok?: boolean; status?: string; skipped?: string } | null;
  return {
    ok: true,
    status: row?.status || "pending",
    skipped: row?.skipped,
  };
}

export async function respondPlaylistCollab(
  supabase: SupabaseClient,
  playlistId: string,
  accept: boolean,
): Promise<
  | { ok: true; status: string; skipped?: string }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "invite_not_found"
        | "missing_table"
        | "failed";
    }
> {
  const { data, error } = await supabase.rpc("respond_playlist_collab", {
    p_playlist_id: playlistId,
    p_accept: accept,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlist collaborators SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    if (/invite_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Invite not found",
        code: "invite_not_found",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as { ok?: boolean; status?: string; skipped?: string } | null;
  return {
    ok: true,
    status: row?.status || (accept ? "accepted" : "declined"),
    skipped: row?.skipped,
  };
}

export async function removePlaylistCollaborator(
  supabase: SupabaseClient,
  playlistId: string,
  userId?: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?: "not_authenticated" | "missing_table" | "failed";
    }
> {
  const { error } = await supabase.rpc("remove_playlist_collaborator", {
    p_playlist_id: playlistId,
    p_user_id: userId ?? null,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlist collaborators SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  return { ok: true };
}

export async function requestPlaylistCollab(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<
  | { ok: true; skipped?: string }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "missing_table"
        | "not_following"
        | "playlist_private"
        | "playlist_not_found"
        | "blocked"
        | "cannot_request_own"
        | "failed";
    }
> {
  const { data, error } = await supabase.rpc(
    "notify_playlist_collab_request",
    { p_playlist_id: playlistId },
  );

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlist collab request SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    if (/not_following/i.test(error.message)) {
      return {
        ok: false,
        error: "Follow the owner first to ask",
        code: "not_following",
      };
    }
    if (/playlist_private/i.test(error.message)) {
      return {
        ok: false,
        error: "Only public mixes accept collab asks",
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
        error: "You can’t ask this person",
        code: "blocked",
      };
    }
    if (/cannot_request_own/i.test(error.message)) {
      return {
        ok: false,
        error: "That’s your mix",
        code: "cannot_request_own",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as { skipped?: string } | null;
  return {
    ok: true,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

export async function loadPlaylistCollabAskPending(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{ pending: boolean; missingRpc: boolean }> {
  const { data, error } = await supabase.rpc(
    "has_playlist_collab_ask_pending",
    { p_playlist_id: playlistId },
  );

  if (error) {
    if (isMissingRelation(error.message)) {
      return { pending: false, missingRpc: true };
    }
    return { pending: false, missingRpc: false };
  }

  return { pending: Boolean(data), missingRpc: false };
}

export async function approvePlaylistCollabRequest(
  supabase: SupabaseClient,
  playlistId: string,
  userId: string,
): Promise<
  | { ok: true; status: string; skipped?: string }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "not_owner"
        | "no_request"
        | "missing_table"
        | "playlist_not_found"
        | "failed";
    }
> {
  const { data, error } = await supabase.rpc(
    "approve_playlist_collab_request",
    {
      p_playlist_id: playlistId,
      p_user_id: userId,
    },
  );

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run collab approve SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    if (/not_owner/i.test(error.message)) {
      return { ok: false, error: "Only the owner can approve", code: "not_owner" };
    }
    if (/no_request/i.test(error.message)) {
      return {
        ok: false,
        error: "No collab ask from this person",
        code: "no_request",
      };
    }
    if (/blocked/i.test(error.message)) {
      return {
        ok: false,
        error: "You can’t approve this person",
        code: "failed",
      };
    }
    if (/playlist_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Playlist not found",
        code: "playlist_not_found",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as { ok?: boolean; status?: string; skipped?: string } | null;
  return {
    ok: true,
    status: row?.status || "accepted",
    skipped: row?.skipped,
  };
}

export async function declinePlaylistCollabRequest(
  supabase: SupabaseClient,
  playlistId: string,
  userId: string,
): Promise<
  | { ok: true; status: string; skipped?: string }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "not_owner"
        | "missing_table"
        | "playlist_not_found"
        | "failed";
    }
> {
  const { data, error } = await supabase.rpc(
    "decline_playlist_collab_request",
    {
      p_playlist_id: playlistId,
      p_user_id: userId,
    },
  );

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run collab approve SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    if (/not_owner/i.test(error.message)) {
      return { ok: false, error: "Only the owner can decline", code: "not_owner" };
    }
    if (/playlist_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Playlist not found",
        code: "playlist_not_found",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as { ok?: boolean; status?: string; skipped?: string } | null;
  return {
    ok: true,
    status: row?.status || "declined",
    skipped: row?.skipped,
  };
}

export async function loadPlaylistCollabAsks(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{
  asks: PlaylistCollabAsk[];
  missingTable: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("list_playlist_collab_asks", {
    p_playlist_id: playlistId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return { asks: [], missingTable: true, error: null };
    }
    if (/not_owner|not_authenticated/i.test(error.message)) {
      return { asks: [], missingTable: false, error: null };
    }
    return { asks: [], missingTable: false, error: error.message };
  }

  const rows = Array.isArray(data)
    ? (data as {
        asker_id?: string;
        created_at?: string;
        notification_id?: number | null;
      }[])
    : [];

  if (rows.length === 0) {
    return { asks: [], missingTable: false, error: null };
  }

  const ids = rows
    .map((r) => r.asker_id)
    .filter((id): id is string => Boolean(id));
  const nameById = await loadArtistCreditMap(supabase, ids);

  const { data: users } = await supabase
    .from("users")
    .select("id, display_name, avatar_url")
    .in("id", ids);

  const byId = new Map(
    (users ?? []).map((u) => [u.id as string, u as Record<string, unknown>]),
  );

  const asks: PlaylistCollabAsk[] = rows.map((r) => {
    const id = r.asker_id as string;
    const u = byId.get(id);
    const name =
      (typeof u?.display_name === "string" && u.display_name.trim()) ||
      nameById.get(id) ||
      "Listener";
    return {
      user_id: id,
      display_name: name,
      avatar_url:
        typeof u?.avatar_url === "string" ? (u.avatar_url as string) : null,
      created_at: typeof r.created_at === "string" ? r.created_at : null,
      notification_id:
        typeof r.notification_id === "number" ? r.notification_id : null,
    };
  });

  return { asks, missingTable: false, error: null };
}

export async function cancelPlaylistCollabAsk(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<
  | { ok: true; skipped?: string }
  | {
      ok: false;
      error: string;
      code?: "not_authenticated" | "missing_table" | "failed";
    }
> {
  const { data, error } = await supabase.rpc("cancel_playlist_collab_ask", {
    p_playlist_id: playlistId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run durable collab asks SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as { skipped?: string } | null;
  return {
    ok: true,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}
