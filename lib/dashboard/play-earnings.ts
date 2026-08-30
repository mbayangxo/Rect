import type { SupabaseClient } from "@supabase/supabase-js";

/** Demo XOF credited to the artist per listener play-credit spend. */
export const PLAY_EARNING_XOF = 10;

export type PlayEarningResult =
  | {
      ok: true;
      earning_id: number | null;
      artist_id: string | null;
      amount_xof: number | null;
      skipped?: string;
    }
  | { ok: false; error: string; code: "missing_table" | "failed" };

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

/**
 * After a credited play insert, accrue demo XOF for the track artist.
 */
export async function recordPlayEarning(
  supabase: SupabaseClient,
  trackId: string,
  playId: string,
  amountXof: number = PLAY_EARNING_XOF,
): Promise<PlayEarningResult> {
  const id = playId.trim();
  if (!id) {
    return { ok: false, error: "Invalid play id", code: "failed" };
  }

  const { data, error } = await supabase.rpc("record_play_earning", {
    p_track_id: trackId,
    p_play_id: id,
    p_amount_xof: amountXof,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run 20260811_artist_play_earnings.sql in Supabase.",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as Record<string, unknown> | null;
  return {
    ok: true,
    earning_id: row?.earning_id != null ? Number(row.earning_id) : null,
    artist_id: typeof row?.artist_id === "string" ? row.artist_id : null,
    amount_xof: row?.amount_xof != null ? Number(row.amount_xof) : null,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

export type ArtistPlayEarnings = {
  totalXof: number;
  thisMonthXof: number;
  playCount: number;
  missingTable: boolean;
  error: string | null;
};

export async function loadArtistPlayEarnings(
  supabase: SupabaseClient,
  artistId: string,
): Promise<ArtistPlayEarnings> {
  const empty: ArtistPlayEarnings = {
    totalXof: 0,
    thisMonthXof: 0,
    playCount: 0,
    missingTable: false,
    error: null,
  };

  try {
    const { data, error } = await supabase
      .from("artist_play_earnings")
      .select("amount_xof, created_at")
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { ...empty, missingTable: true };
      }
      return { ...empty, error: error.message };
    }

    const monthStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    ).toISOString();

    let totalXof = 0;
    let thisMonthXof = 0;
    for (const row of data ?? []) {
      const amt = Number(row.amount_xof) || 0;
      totalXof += amt;
      const at = row.created_at as string | null;
      if (at && at >= monthStart) thisMonthXof += amt;
    }

    return {
      totalXof,
      thisMonthXof,
      playCount: (data ?? []).length,
      missingTable: false,
      error: null,
    };
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : "Failed to load play earnings",
    };
  }
}
