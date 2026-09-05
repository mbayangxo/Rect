import type { SupabaseClient } from "@supabase/supabase-js";

function isMissing(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type RectLive = {
  id: string;
  artist_id: string;
  title: string;
  status: "offline" | "live" | "ended";
  visibility: "public" | "fan_club" | "private";
  host: "world" | "portal";
  portal_release_id: string | null;
  viewer_count: number;
  country: string | null;
  city: string | null;
  started_at: string | null;
};

export async function startRectLive(
  supabase: SupabaseClient,
  input: {
    title: string;
    visibility: "public" | "fan_club" | "private";
    host?: "world" | "portal";
    portalReleaseId?: string | null;
    country?: string | null;
    city?: string | null;
  },
): Promise<
  | { ok: true; rect_live_id: string; skipped?: string }
  | { ok: false; error: string; code: string }
> {
  const { data, error } = await supabase.rpc("start_rect_live", {
    p_title: input.title,
    p_visibility: input.visibility,
    p_host: input.host ?? "world",
    p_portal_release_id: input.portalReleaseId ?? null,
    p_country: input.country ?? null,
    p_city: input.city ?? null,
  });
  if (error) {
    const msg = error.message || "Could not start RECT Live";
    if (isMissing(msg)) {
      return {
        ok: false,
        error: "Run 20260830_rect_live.sql in Supabase.",
        code: "missing_table",
      };
    }
    if (/live_room_active/i.test(msg)) {
      return {
        ok: false,
        error: "End your casual Live Room before starting RECT Live",
        code: "live_room_active",
      };
    }
    if (/portal_required/i.test(msg)) {
      return {
        ok: false,
        error: "Pick a portal for portal-hosted RECT Live",
        code: "portal_required",
      };
    }
    return { ok: false, error: msg, code: "error" };
  }
  const row = data as { rect_live_id?: string; skipped?: string } | null;
  if (!row?.rect_live_id) {
    return { ok: false, error: "Could not start RECT Live", code: "error" };
  }
  return {
    ok: true,
    rect_live_id: String(row.rect_live_id),
    skipped: row.skipped ? String(row.skipped) : undefined,
  };
}

export async function endRectLive(
  supabase: SupabaseClient,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const { error } = await supabase.rpc("end_rect_live", {
    p_rect_live_id: id,
  });
  if (error) {
    return { ok: false, error: error.message, code: "error" };
  }
  return { ok: true };
}

export async function loadArtistActiveRectLive(
  supabase: SupabaseClient,
  artistId: string,
): Promise<{ live: RectLive | null; missingTable: boolean }> {
  const { data, error } = await supabase
    .from("rect_lives")
    .select(
      "id, artist_id, title, status, visibility, host, portal_release_id, viewer_count, country, city, started_at",
    )
    .eq("artist_id", artistId)
    .eq("status", "live")
    .maybeSingle();

  if (error) {
    if (isMissing(error.message)) {
      return { live: null, missingTable: true };
    }
    return { live: null, missingTable: false };
  }
  if (!data) return { live: null, missingTable: false };
  return {
    live: {
      id: String(data.id),
      artist_id: String(data.artist_id),
      title: String(data.title ?? "RECT Live"),
      status: (data.status as RectLive["status"]) || "live",
      visibility: (data.visibility as RectLive["visibility"]) || "public",
      host: data.host === "portal" ? "portal" : "world",
      portal_release_id:
        typeof data.portal_release_id === "string"
          ? data.portal_release_id
          : null,
      viewer_count: Number(data.viewer_count) || 0,
      country: typeof data.country === "string" ? data.country : null,
      city: typeof data.city === "string" ? data.city : null,
      started_at: typeof data.started_at === "string" ? data.started_at : null,
    },
    missingTable: false,
  };
}

export async function loadPublicRectLivesNow(
  supabase: SupabaseClient,
  limit = 16,
): Promise<{
  lives: (RectLive & {
    artist_name?: string | null;
    artist_avatar?: string | null;
  })[];
  missingTable: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("rect_lives")
    .select(
      "id, artist_id, title, status, visibility, host, portal_release_id, viewer_count, country, city, started_at",
    )
    .eq("status", "live")
    .eq("visibility", "public")
    .order("viewer_count", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissing(error.message)) {
      return { lives: [], missingTable: true, error: null };
    }
    return { lives: [], missingTable: false, error: error.message };
  }
  const lives = (data ?? []).map((row) => ({
    id: String(row.id),
    artist_id: String(row.artist_id),
    title: String(row.title ?? "RECT Live"),
    status: "live" as const,
    visibility: "public" as const,
    host: row.host === "portal" ? ("portal" as const) : ("world" as const),
    portal_release_id:
      typeof row.portal_release_id === "string" ? row.portal_release_id : null,
    viewer_count: Number(row.viewer_count) || 0,
    country: typeof row.country === "string" ? row.country : null,
    city: typeof row.city === "string" ? row.city : null,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
  }));

  const artistIds = [...new Set(lives.map((l) => l.artist_id))];
  if (artistIds.length === 0) {
    return { lives, missingTable: false, error: null };
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
  return {
    lives: lives.map((l) => {
      const u = byId.get(l.artist_id);
      return {
        ...l,
        artist_name: u?.name ?? "Artist",
        artist_avatar: u?.avatar ?? null,
      };
    }),
    missingTable: false,
    error: null,
  };
}
