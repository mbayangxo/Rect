import type { SupabaseClient } from "@supabase/supabase-js";

function isMissing(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type LiveRoomMode = "video" | "photos" | "audio";
export type LiveRoomVisibility = "public" | "fan_club" | "private";
export type LiveRoomStatus = "offline" | "live" | "ended";

export type LiveRoom = {
  id: string;
  artist_id: string;
  title: string;
  status: LiveRoomStatus;
  mode: LiveRoomMode;
  visibility: LiveRoomVisibility;
  host: "world" | "portal";
  viewer_count: number;
  stage_photo_url: string | null;
  country: string | null;
  city: string | null;
  neighborhood: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  artist_name?: string;
  artist_avatar?: string | null;
};

export type LiveRoomMessage = {
  id: number;
  live_room_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
};

export type LiveRoomPhoto = {
  id: number;
  photo_url: string;
  caption: string | null;
  created_at: string;
};

function mapRoom(row: Record<string, unknown>): LiveRoom {
  return {
    id: String(row.id),
    artist_id: String(row.artist_id),
    title: String(row.title ?? "Live Room"),
    status: (row.status as LiveRoomStatus) || "offline",
    mode: (row.mode as LiveRoomMode) || "video",
    visibility: (row.visibility as LiveRoomVisibility) || "public",
    host: row.host === "portal" ? "portal" : "world",
    viewer_count: Number(row.viewer_count) || 0,
    stage_photo_url:
      typeof row.stage_photo_url === "string" ? row.stage_photo_url : null,
    country: typeof row.country === "string" ? row.country : null,
    city: typeof row.city === "string" ? row.city : null,
    neighborhood:
      typeof row.neighborhood === "string" ? row.neighborhood : null,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
    ended_at: typeof row.ended_at === "string" ? row.ended_at : null,
    created_at: String(row.created_at ?? ""),
  };
}

export async function startLiveRoom(
  supabase: SupabaseClient,
  input: {
    title: string;
    mode: LiveRoomMode;
    visibility: LiveRoomVisibility;
    country?: string | null;
    city?: string | null;
    neighborhood?: string | null;
    host?: "world" | "portal";
    portalReleaseId?: string | null;
  },
): Promise<
  | { ok: true; live_room_id: string; skipped?: string }
  | { ok: false; error: string; code: string }
> {
  const { data, error } = await supabase.rpc("start_live_room", {
    p_title: input.title,
    p_mode: input.mode,
    p_visibility: input.visibility,
    p_country: input.country ?? null,
    p_city: input.city ?? null,
    p_neighborhood: input.neighborhood ?? null,
    p_host: input.host ?? "world",
    p_portal_release_id: input.portalReleaseId ?? null,
  });
  if (error) {
    const msg = error.message || "Could not start Live Room";
    if (isMissing(msg)) {
      return {
        ok: false,
        error: "Run 20260830_live_rooms.sql in Supabase.",
        code: "missing_table",
      };
    }
    if (/not_authenticated/i.test(msg)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    return { ok: false, error: msg, code: "error" };
  }
  const row = data as { live_room_id?: string; skipped?: string } | null;
  if (!row?.live_room_id) {
    return { ok: false, error: "Could not start Live Room", code: "error" };
  }
  return {
    ok: true,
    live_room_id: String(row.live_room_id),
    skipped: row.skipped ? String(row.skipped) : undefined,
  };
}

export async function endLiveRoom(
  supabase: SupabaseClient,
  liveRoomId: string,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const { error } = await supabase.rpc("end_live_room", {
    p_live_room_id: liveRoomId,
  });
  if (error) {
    const msg = error.message || "Could not end Live Room";
    if (isMissing(msg)) {
      return {
        ok: false,
        error: "Run 20260830_live_rooms.sql in Supabase.",
        code: "missing_table",
      };
    }
    if (/not_owner/i.test(msg)) {
      return { ok: false, error: "Not your Live Room", code: "not_owner" };
    }
    return { ok: false, error: msg, code: "error" };
  }
  return { ok: true };
}

export async function joinLiveRoom(
  supabase: SupabaseClient,
  liveRoomId: string,
): Promise<
  | { ok: true; viewer_count: number; mode: LiveRoomMode; title: string }
  | { ok: false; error: string; code: string }
> {
  const { data, error } = await supabase.rpc("join_live_room", {
    p_live_room_id: liveRoomId,
  });
  if (error) {
    const msg = error.message || "Could not join";
    if (isMissing(msg)) {
      return {
        ok: false,
        error: "Run 20260830_live_rooms.sql in Supabase.",
        code: "missing_table",
      };
    }
    if (/fan_club_required/i.test(msg)) {
      return {
        ok: false,
        error: "This Live Room is for fan club members",
        code: "fan_club_required",
      };
    }
    if (/private_room/i.test(msg)) {
      return { ok: false, error: "This Live Room is private", code: "private_room" };
    }
    if (/not_live/i.test(msg)) {
      return { ok: false, error: "This Live Room ended", code: "not_live" };
    }
    if (/not_authenticated/i.test(msg)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    return { ok: false, error: msg, code: "error" };
  }
  const row = data as {
    viewer_count?: number;
    mode?: string;
    title?: string;
  } | null;
  return {
    ok: true,
    viewer_count: Number(row?.viewer_count) || 0,
    mode: (row?.mode as LiveRoomMode) || "video",
    title: String(row?.title ?? "Live Room"),
  };
}

export async function leaveLiveRoom(
  supabase: SupabaseClient,
  liveRoomId: string,
) {
  await supabase.rpc("leave_live_room", { p_live_room_id: liveRoomId });
}

export async function sendLiveRoomMessage(
  supabase: SupabaseClient,
  liveRoomId: string,
  body: string,
): Promise<
  | { ok: true; message: LiveRoomMessage }
  | { ok: false; error: string; code: string }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required", code: "not_authenticated" };
  }
  const { data, error } = await supabase.rpc("send_live_room_message", {
    p_live_room_id: liveRoomId,
    p_body: body,
  });
  if (error) {
    const msg = error.message || "Could not send";
    if (/body_required/i.test(msg)) {
      return { ok: false, error: "Write a message", code: "body_required" };
    }
    return { ok: false, error: msg, code: "error" };
  }
  const row = data as {
    message_id?: number;
    body?: string;
    sender_id?: string;
    created_at?: string;
  } | null;
  return {
    ok: true,
    message: {
      id: Number(row?.message_id),
      live_room_id: liveRoomId,
      sender_id: String(row?.sender_id ?? user.id),
      body: String(row?.body ?? body),
      created_at: String(row?.created_at ?? new Date().toISOString()),
    },
  };
}

export async function pushLiveRoomPhoto(
  supabase: SupabaseClient,
  liveRoomId: string,
  photoUrl: string,
  caption?: string,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const { error } = await supabase.rpc("push_live_room_photo", {
    p_live_room_id: liveRoomId,
    p_photo_url: photoUrl,
    p_caption: caption ?? null,
  });
  if (error) {
    return { ok: false, error: error.message, code: "error" };
  }
  return { ok: true };
}

export async function loadLiveRoomById(
  supabase: SupabaseClient,
  id: string,
): Promise<{
  room: LiveRoom | null;
  missingTable: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("live_rooms")
    .select(
      "id, artist_id, title, status, mode, visibility, host, viewer_count, stage_photo_url, country, city, neighborhood, started_at, ended_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissing(error.message)) {
      return { room: null, missingTable: true, error: error.message };
    }
    return { room: null, missingTable: false, error: error.message };
  }
  if (!data) return { room: null, missingTable: false, error: null };
  return { room: mapRoom(data as Record<string, unknown>), missingTable: false, error: null };
}

export async function loadArtistActiveLiveRoom(
  supabase: SupabaseClient,
  artistId: string,
): Promise<{
  room: LiveRoom | null;
  missingTable: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("live_rooms")
    .select(
      "id, artist_id, title, status, mode, visibility, host, viewer_count, stage_photo_url, country, city, neighborhood, started_at, ended_at, created_at",
    )
    .eq("artist_id", artistId)
    .eq("status", "live")
    .maybeSingle();

  if (error) {
    if (isMissing(error.message)) {
      return { room: null, missingTable: true, error: null };
    }
    return { room: null, missingTable: false, error: error.message };
  }
  if (!data) return { room: null, missingTable: false, error: null };
  return { room: mapRoom(data as Record<string, unknown>), missingTable: false, error: null };
}

export async function loadArtistLiveRoomSession(
  supabase: SupabaseClient,
  artistId: string,
): Promise<{
  room: LiveRoom | null;
  missingTable: boolean;
  error: string | null;
}> {
  const active = await loadArtistActiveLiveRoom(supabase, artistId);
  if (active.room || active.missingTable) return active;

  const { data, error } = await supabase
    .from("live_rooms")
    .select(
      "id, artist_id, title, status, mode, visibility, host, viewer_count, stage_photo_url, country, city, neighborhood, started_at, ended_at, created_at",
    )
    .eq("artist_id", artistId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissing(error.message)) {
      return { room: null, missingTable: true, error: null };
    }
    return { room: null, missingTable: false, error: error.message };
  }
  if (!data) return { room: null, missingTable: false, error: null };
  return { room: mapRoom(data as Record<string, unknown>), missingTable: false, error: null };
}

export async function loadPublicLiveNow(
  supabase: SupabaseClient,
  limit = 24,
): Promise<{
  rooms: LiveRoom[];
  missingTable: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("live_rooms")
    .select(
      "id, artist_id, title, status, mode, visibility, host, viewer_count, stage_photo_url, country, city, neighborhood, started_at, ended_at, created_at",
    )
    .eq("status", "live")
    .eq("visibility", "public")
    .eq("host", "world")
    .order("viewer_count", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissing(error.message)) {
      return { rooms: [], missingTable: true, error: null };
    }
    return { rooms: [], missingTable: false, error: error.message };
  }

  const rooms = (data ?? []).map((r) => mapRoom(r as Record<string, unknown>));
  const artistIds = [...new Set(rooms.map((r) => r.artist_id))];
  if (artistIds.length === 0) {
    return { rooms, missingTable: false, error: null };
  }

  const { data: users } = await supabase
    .from("users")
    .select("id, display_name, avatar_url")
    .in("id", artistIds);

  const byId = new Map(
    (users ?? []).map((u) => [
      u.id as string,
      {
        name: (u.display_name as string) || "Artist",
        avatar: (u.avatar_url as string) || null,
      },
    ]),
  );

  for (const room of rooms) {
    const u = byId.get(room.artist_id);
    room.artist_name = u?.name ?? "Artist";
    room.artist_avatar = u?.avatar ?? null;
  }

  return { rooms, missingTable: false, error: null };
}

export async function loadLiveRoomMessages(
  supabase: SupabaseClient,
  liveRoomId: string,
  limit = 80,
): Promise<LiveRoomMessage[]> {
  const { data } = await supabase
    .from("live_room_messages")
    .select("id, live_room_id, sender_id, body, created_at")
    .eq("live_room_id", liveRoomId)
    .order("created_at", { ascending: true })
    .limit(limit);

  const msgs = (data ?? []).map((m) => ({
    id: Number(m.id),
    live_room_id: String(m.live_room_id),
    sender_id: String(m.sender_id),
    body: String(m.body ?? ""),
    created_at: String(m.created_at),
  }));

  const senderIds = [...new Set(msgs.map((m) => m.sender_id))];
  if (senderIds.length === 0) return msgs;

  const { data: users } = await supabase
    .from("users")
    .select("id, display_name")
    .in("id", senderIds);
  const names = new Map(
    (users ?? []).map((u) => [u.id as string, (u.display_name as string) || "Fan"]),
  );
  return msgs.map((m) => ({
    ...m,
    sender_name: names.get(m.sender_id) ?? "Fan",
  }));
}

export async function loadLiveRoomPhotos(
  supabase: SupabaseClient,
  liveRoomId: string,
): Promise<LiveRoomPhoto[]> {
  const { data } = await supabase
    .from("live_room_photos")
    .select("id, photo_url, caption, created_at")
    .eq("live_room_id", liveRoomId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (data ?? []).map((p) => ({
    id: Number(p.id),
    photo_url: String(p.photo_url),
    caption: typeof p.caption === "string" ? p.caption : null,
    created_at: String(p.created_at),
  }));
}
