import type { SupabaseClient } from "@supabase/supabase-js";

function isMissing(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type TrendingTrack = {
  track_id: string;
  title: string;
  artist_id: string;
  artist_name: string;
  play_count: number;
  cover_art_url: string | null;
};

export type TrendingPortal = {
  release_id: string;
  artist_id: string;
  artist_name: string;
  title: string;
  cover_url: string | null;
  kind: string;
  media_count: number;
};

export type TrendingLiveRoom = {
  live_room_id: string;
  artist_id: string;
  artist_name: string;
  artist_avatar: string | null;
  title: string;
  mode: string;
  viewer_count: number;
  country: string | null;
  city: string | null;
  neighborhood: string | null;
};

async function hydrateArtistNames(
  supabase: SupabaseClient,
  artistIds: string[],
): Promise<Map<string, { name: string; avatar: string | null }>> {
  const unique = [...new Set(artistIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("users")
    .select("id, display_name, avatar_url")
    .in("id", unique);
  return new Map(
    (data ?? []).map((u) => [
      u.id as string,
      {
        name: (u.display_name as string) || "Artist",
        avatar: (u.avatar_url as string) || null,
      },
    ]),
  );
}

export async function loadTrendingTracks(
  supabase: SupabaseClient,
  limit = 20,
): Promise<{
  tracks: TrendingTrack[];
  missingRpc: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("trending_tracks", {
    p_limit: limit,
  });
  if (error) {
    if (isMissing(error.message)) {
      // Fallback: tracks + track_play_counts (no play_count column on tracks)
      type FbRow = {
        id: string;
        title: string | null;
        artist_id: string | null;
        cover_art_url: string | null;
        status: string | null;
        audio_url: string | null;
        created_at: string | null;
        content_kind?: string | null;
      };
      let fbRows: FbRow[] = [];
      const withKind = await supabase
        .from("tracks")
        .select(
          "id, title, artist_id, cover_art_url, status, audio_url, created_at, content_kind",
        )
        .not("audio_url", "is", null)
        .limit(Math.min(limit * 5, 100));
      if (withKind.error && /content_kind/i.test(withKind.error.message)) {
        const bare = await supabase
          .from("tracks")
          .select(
            "id, title, artist_id, cover_art_url, status, audio_url, created_at",
          )
          .not("audio_url", "is", null)
          .limit(Math.min(limit * 5, 100));
        if (bare.error) {
          return { tracks: [], missingRpc: true, error: bare.error.message };
        }
        fbRows = (bare.data ?? []) as FbRow[];
      } else if (withKind.error) {
        return { tracks: [], missingRpc: true, error: withKind.error.message };
      } else {
        fbRows = (withKind.data ?? []) as FbRow[];
      }
      const rows = fbRows.filter((t) => {
        const live =
          !t.status || t.status === "live" || t.status === "published";
        return live && t.content_kind !== "podcast";
      });
      const ids = rows.map((r) => r.id as string);
      const counts = new Map<string, number>();
      if (ids.length > 0) {
        const { data: countRows } = await supabase
          .from("track_play_counts")
          .select("track_id, play_count")
          .in("track_id", ids);
        for (const row of countRows ?? []) {
          counts.set(
            row.track_id as string,
            Number(row.play_count) || 0,
          );
        }
      }
      const sorted = rows
        .map((r) => ({
          ...r,
          play_count: counts.get(r.id as string) ?? 0,
        }))
        .sort((a, b) => {
          if (b.play_count !== a.play_count) {
            return b.play_count - a.play_count;
          }
          const aTime = a.created_at
            ? new Date(a.created_at as string).getTime()
            : 0;
          const bTime = b.created_at
            ? new Date(b.created_at as string).getTime()
            : 0;
          return bTime - aTime;
        })
        .slice(0, limit);
      const names = await hydrateArtistNames(
        supabase,
        sorted.map((r) => r.artist_id as string),
      );
      return {
        tracks: sorted.map((r) => ({
          track_id: String(r.id),
          title: String(r.title ?? "Track"),
          artist_id: String(r.artist_id),
          artist_name: names.get(String(r.artist_id))?.name ?? "Artist",
          play_count: r.play_count,
          cover_art_url:
            typeof r.cover_art_url === "string" ? r.cover_art_url : null,
        })),
        missingRpc: true,
        error: null,
      };
    }
    return { tracks: [], missingRpc: false, error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const names = await hydrateArtistNames(
    supabase,
    rows.map((r) => String(r.artist_id)),
  );
  return {
    tracks: rows.map((r) => ({
      track_id: String(r.track_id),
      title: String(r.title ?? "Track"),
      artist_id: String(r.artist_id),
      artist_name: names.get(String(r.artist_id))?.name ?? "Artist",
      play_count: Number(r.play_count) || 0,
      cover_art_url:
        typeof r.cover_art_url === "string" ? r.cover_art_url : null,
    })),
    missingRpc: false,
    error: null,
  };
}

export async function loadTrendingPortals(
  supabase: SupabaseClient,
  limit = 12,
): Promise<{
  portals: TrendingPortal[];
  missingRpc: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("trending_portals", {
    p_limit: limit,
  });
  if (error) {
    if (isMissing(error.message)) {
      const fb = await supabase
        .from("portal_releases")
        .select("id, artist_id, title, cover_url, kind, published")
        .eq("published", true)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (fb.error) {
        return {
          portals: [],
          missingRpc: true,
          error: /does not exist|PGRST205/i.test(fb.error.message)
            ? null
            : fb.error.message,
        };
      }
      const rows = fb.data ?? [];
      const names = await hydrateArtistNames(
        supabase,
        rows.map((r) => r.artist_id as string),
      );
      return {
        portals: rows.map((r) => ({
          release_id: String(r.id),
          artist_id: String(r.artist_id),
          artist_name: names.get(String(r.artist_id))?.name ?? "Artist",
          title: String(r.title ?? "Portal"),
          cover_url: typeof r.cover_url === "string" ? r.cover_url : null,
          kind: String(r.kind ?? "world"),
          media_count: 0,
        })),
        missingRpc: true,
        error: null,
      };
    }
    return { portals: [], missingRpc: false, error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const names = await hydrateArtistNames(
    supabase,
    rows.map((r) => String(r.artist_id)),
  );
  return {
    portals: rows.map((r) => ({
      release_id: String(r.release_id),
      artist_id: String(r.artist_id),
      artist_name: names.get(String(r.artist_id))?.name ?? "Artist",
      title: String(r.title ?? "Portal"),
      cover_url: typeof r.cover_url === "string" ? r.cover_url : null,
      kind: String(r.kind ?? "world"),
      media_count: Number(r.media_count) || 0,
    })),
    missingRpc: false,
    error: null,
  };
}

export async function loadTrendingLiveRoomsNearby(
  supabase: SupabaseClient,
  place: {
    country?: string | null;
    city?: string | null;
    neighborhood?: string | null;
  },
  limit = 16,
): Promise<{
  rooms: TrendingLiveRoom[];
  missingRpc: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("trending_live_rooms_by_place", {
    p_country: place.country ?? null,
    p_city: place.city ?? null,
    p_neighborhood: place.neighborhood ?? null,
    p_limit: limit,
  });

  if (error) {
    if (isMissing(error.message)) {
      const { loadPublicLiveNow } = await import("@/lib/dashboard/live-rooms");
      const fb = await loadPublicLiveNow(supabase, limit);
      return {
        rooms: fb.rooms.map((r) => ({
          live_room_id: r.id,
          artist_id: r.artist_id,
          artist_name: r.artist_name ?? "Artist",
          artist_avatar: r.artist_avatar ?? null,
          title: r.title,
          mode: r.mode,
          viewer_count: r.viewer_count,
          country: r.country,
          city: r.city,
          neighborhood: r.neighborhood,
        })),
        missingRpc: true,
        error: fb.error,
      };
    }
    return { rooms: [], missingRpc: false, error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const names = await hydrateArtistNames(
    supabase,
    rows.map((r) => String(r.artist_id)),
  );
  return {
    rooms: rows.map((r) => {
      const id = String(r.artist_id);
      const u = names.get(id);
      return {
        live_room_id: String(r.live_room_id),
        artist_id: id,
        artist_name: u?.name ?? "Artist",
        artist_avatar: u?.avatar ?? null,
        title: String(r.title ?? "Live Room"),
        mode: String(r.mode ?? "photos"),
        viewer_count: Number(r.viewer_count) || 0,
        country: typeof r.country === "string" ? r.country : null,
        city: typeof r.city === "string" ? r.city : null,
        neighborhood:
          typeof r.neighborhood === "string" ? r.neighborhood : null,
      };
    }),
    missingRpc: false,
    error: null,
  };
}
