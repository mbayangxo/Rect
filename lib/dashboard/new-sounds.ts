import type { SupabaseClient } from "@supabase/supabase-js";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { loadLikeCountMap } from "@/lib/dashboard/likes";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isDemoTrack,
  isMusicTrack,
  isPublishedTrack,
  isTrackLaunched,
  type TrackRow,
} from "@/lib/tracks";

export type NewSoundsTrack = TrackRow & {
  artist_name: string | null;
  like_count: number;
  launch_at_display: string | null;
};

/**
 * New Sounds — recently launched (or unscheduled) live tracks on RECT.
 * Prefers RPC new_wave_tracks when migration applied; falls back to catalog query.
 * (DB RPC name kept for compatibility; product name is New Sounds.)
 */
export async function loadNewSoundsTracks(
  supabase: SupabaseClient,
  limit = 40,
): Promise<{ tracks: NewSoundsTrack[]; error: string | null; viaRpc: boolean }> {
  const admin = createAdminClient();
  const db = admin ?? supabase;

  try {
    const { data: rpcData, error: rpcError } = await db.rpc("new_wave_tracks", {
      p_limit: limit,
    });

    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      const ids = rpcData
        .map((r: { track_id?: string }) => r.track_id)
        .filter(Boolean) as string[];
      let { data: tracks, error: enrichErr } = await db
        .from("tracks")
        .select(
          "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at, launch_at, content_kind",
        )
        .in("id", ids);

      if (
        enrichErr &&
        /content_kind|column .* does not exist/i.test(enrichErr.message)
      ) {
        const lean = await db
          .from("tracks")
          .select(
            "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at, launch_at",
          )
          .in("id", ids);
        tracks = lean.data as typeof tracks;
        enrichErr = lean.error;
      }

      if (enrichErr || !tracks || tracks.length === 0) {
        // Fall through to catalog query — don't return empty viaRpc.
      } else {
        const byId = new Map(
          ((tracks ?? []) as TrackRow[]).map((t) => [t.id, t]),
        );
        const ordered: TrackRow[] = [];
        const launchAt = new Map<string, string | null>();
        for (const row of rpcData as {
          track_id: string;
          launch_at?: string | null;
        }[]) {
          const t = byId.get(row.track_id);
          if (
            t &&
            isMusicTrack(t) &&
            isPublishedTrack(t) &&
            !isDemoTrack(t) &&
            isTrackLaunched(t)
          ) {
            ordered.push(t);
            launchAt.set(
              t.id,
              typeof row.launch_at === "string" ? row.launch_at : null,
            );
          }
        }
        if (ordered.length > 0) {
          return {
            tracks: await enrich(db, ordered.slice(0, limit), launchAt),
            error: null,
            viaRpc: true,
          };
        }
      }
    }
  } catch {
    /* fall through */
  }

  const { data, error } = await db
    .from("tracks")
    .select(
      "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at, launch_at, content_kind",
    )
    .or("status.eq.live,status.eq.published,status.is.null")
    .or("content_kind.is.null,content_kind.eq.music")
    .not("audio_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 2, 60));

  if (error) {
    // Missing content_kind column — fall back without podcast filter.
    if (/content_kind|column .* does not exist/i.test(error.message)) {
      const lean = await db
        .from("tracks")
        .select(
          "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at, launch_at",
        )
        .or("status.eq.live,status.eq.published,status.is.null")
        .not("audio_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(Math.max(limit * 2, 60));
      if (lean.error) {
        // retry without launch_at
        const bare = await db
          .from("tracks")
          .select(
            "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at",
          )
          .or("status.eq.live,status.eq.published,status.is.null")
          .not("audio_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(Math.max(limit * 2, 60));
        if (bare.error) {
          return { tracks: [], error: bare.error.message, viaRpc: false };
        }
        const rows = ((bare.data ?? []) as TrackRow[])
          .filter(
            (t) => isPublishedTrack(t) && !isDemoTrack(t) && isTrackLaunched(t),
          )
          .slice(0, limit);
        return {
          tracks: await enrich(db, rows, new Map()),
          error: null,
          viaRpc: false,
        };
      }
      const rows = ((lean.data ?? []) as TrackRow[])
        .filter(
          (t) => isPublishedTrack(t) && !isDemoTrack(t) && isTrackLaunched(t),
        )
        .sort((a, b) => {
          const aAt = a.launch_at || a.created_at || "";
          const bAt = b.launch_at || b.created_at || "";
          return bAt.localeCompare(aAt);
        })
        .slice(0, limit);
      const launchAt = new Map(
        rows.map((t) => [
          t.id,
          (t.launch_at || t.created_at || null) as string | null,
        ]),
      );
      return {
        tracks: await enrich(db, rows, launchAt),
        error: null,
        viaRpc: false,
      };
    }
    const lean = await db
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at",
      )
      .or("status.eq.live,status.eq.published,status.is.null")
      .not("audio_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 2, 60));
    if (lean.error) {
      return { tracks: [], error: lean.error.message, viaRpc: false };
    }
    const rows = ((lean.data ?? []) as TrackRow[])
      .filter((t) => isPublishedTrack(t) && !isDemoTrack(t) && isTrackLaunched(t))
      .slice(0, limit);
    return {
      tracks: await enrich(db, rows, new Map()),
      error: null,
      viaRpc: false,
    };
  }

  const rows = ((data ?? []) as TrackRow[])
    .filter(
      (t) =>
        isPublishedTrack(t) &&
        !isDemoTrack(t) &&
        isTrackLaunched(t) &&
        isMusicTrack(t),
    )
    .sort((a, b) => {
      const aAt = a.launch_at || a.created_at || "";
      const bAt = b.launch_at || b.created_at || "";
      return bAt.localeCompare(aAt);
    })
    .slice(0, limit);

  const launchAt = new Map(
    rows.map((t) => [t.id, (t.launch_at || t.created_at || null) as string | null]),
  );

  return {
    tracks: await enrich(db, rows, launchAt),
    error: null,
    viaRpc: false,
  };
}

async function enrich(
  db: SupabaseClient,
  rows: TrackRow[],
  launchAt: Map<string, string | null>,
): Promise<NewSoundsTrack[]> {
  const artistIds = [
    ...new Set(rows.map((t) => t.artist_id).filter(Boolean) as string[]),
  ];
  const nameById = await loadArtistCreditMap(db, artistIds);
  const likes = await loadLikeCountMap(
    db,
    rows.map((t) => t.id),
  );
  return rows.map((t) => ({
    ...t,
    artist_name: t.artist_id ? (nameById.get(t.artist_id) ?? null) : null,
    like_count: likes.get(t.id) ?? 0,
    launch_at_display:
      launchAt.get(t.id) ?? t.launch_at ?? t.created_at ?? null,
  }));
}
