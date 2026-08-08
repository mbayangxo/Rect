import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { isDemoTrack, type TrackRow } from "@/lib/tracks";

export type JournalEntry = TrackRow & {
  play_id: string;
  played_at: string | null;
};

export type JournalLoadResult = {
  entries: JournalEntry[];
  missingTable: boolean;
  error: string | null;
};

export async function clearListeningJournal(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  | { ok: true; deleted: number }
  | { ok: false; error: string; code?: "missing_table" | "failed" }
> {
  const { data, error } = await supabase
    .from("plays")
    .delete()
    .eq("listener_id", userId)
    .select("id");

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Play history table missing",
        code: "missing_table",
      };
    }
    if (/permission|policy|RLS/i.test(error.message)) {
      return {
        ok: false,
        error: "Run 20260808_plays_delete_own.sql in Supabase first",
        code: "failed",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  return { ok: true, deleted: data?.length ?? 0 };
}

export async function deleteListeningPlay(
  supabase: SupabaseClient,
  userId: string,
  playId: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?: "missing_table" | "not_found" | "failed";
    }
> {
  const id = playId.trim();
  if (!id) {
    return { ok: false, error: "play_id required", code: "failed" };
  }

  const { data, error } = await supabase
    .from("plays")
    .delete()
    .eq("id", id)
    .eq("listener_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Play history table missing",
        code: "missing_table",
      };
    }
    if (/permission|policy|RLS/i.test(error.message)) {
      return {
        ok: false,
        error: "Run 20260808_plays_delete_own.sql in Supabase first",
        code: "failed",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  if (!data) {
    return { ok: false, error: "Play not found", code: "not_found" };
  }

  return { ok: true };
}

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|column .* does not exist/i.test(
    message,
  );
}

/**
 * Private listening journal — own plays, newest first.
 */
export async function loadListeningJournal(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
): Promise<JournalLoadResult> {
  try {
    const admin = createAdminClient();
    type PlayRow = {
      id: string | number;
      track_id: string;
      created_at?: string | null;
    };

    let playRows: PlayRow[] = [];

    const primary = await supabase
      .from("plays")
      .select("id, track_id, created_at")
      .eq("listener_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (primary.error && isMissingRelation(primary.error.message)) {
      const lean = await supabase
        .from("plays")
        .select("id, track_id")
        .eq("listener_id", userId)
        .limit(limit);
      if (lean.error) {
        if (isMissingRelation(lean.error.message)) {
          return { entries: [], missingTable: true, error: null };
        }
        return { entries: [], missingTable: false, error: lean.error.message };
      }
      playRows = (lean.data ?? []) as PlayRow[];
    } else if (primary.error) {
      if (admin) {
        const adminRes = await admin
          .from("plays")
          .select("id, track_id, created_at")
          .eq("listener_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (adminRes.error) {
          return {
            entries: [],
            missingTable: false,
            error: primary.error.message,
          };
        }
        playRows = (adminRes.data ?? []) as PlayRow[];
      } else {
        return {
          entries: [],
          missingTable: false,
          error: primary.error.message,
        };
      }
    } else {
      playRows = (primary.data ?? []) as PlayRow[];
    }

    if (playRows.length === 0) {
      return { entries: [], missingTable: false, error: null };
    }

    const trackIds = [
      ...new Set(playRows.map((p) => p.track_id).filter(Boolean)),
    ];

    const { data: trackRows, error: trackError } = await supabase
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
      )
      .in("id", trackIds);

    if (trackError) {
      return { entries: [], missingTable: false, error: trackError.message };
    }

    const tracks = ((trackRows ?? []) as TrackRow[]).filter(
      (t) => !isDemoTrack(t),
    );
    const artistIds = [
      ...new Set(tracks.map((t) => t.artist_id).filter(Boolean) as string[]),
    ];
    const nameById = await loadArtistCreditMap(supabase, artistIds);

    const trackById = new Map(
      tracks.map((t) => [
        t.id,
        {
          ...t,
          artist_name: t.artist_id
            ? (nameById.get(t.artist_id) ?? null)
            : null,
        },
      ]),
    );

    const entries: JournalEntry[] = [];
    for (const p of playRows) {
      const track = trackById.get(p.track_id);
      if (!track) continue;
      entries.push({
        ...track,
        play_id: String(p.id),
        played_at: typeof p.created_at === "string" ? p.created_at : null,
      });
    }

    return { entries, missingTable: false, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load journal";
    return {
      entries: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

/**
 * Continue listening — unique recent tracks from own plays (newest first).
 */
export async function loadContinueListening(
  supabase: SupabaseClient,
  userId: string,
  limit = 8,
): Promise<JournalLoadResult> {
  const result = await loadListeningJournal(supabase, userId, Math.max(limit * 4, 40));
  if (result.missingTable || result.error) {
    return result;
  }

  const seen = new Set<string>();
  const entries: JournalEntry[] = [];
  for (const e of result.entries) {
    if (!e.audio_url || seen.has(e.id)) continue;
    seen.add(e.id);
    entries.push(e);
    if (entries.length >= limit) break;
  }

  return { entries, missingTable: false, error: null };
}

export function formatPlayedAt(iso: string | null) {
  if (!iso) return "Recently";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Recently";
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
