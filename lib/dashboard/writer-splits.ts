import type { SupabaseClient } from "@supabase/supabase-js";

export type WriterSplit = {
  id: number | null;
  writer_name: string;
  share_percent: number;
  sort_order: number;
};

export type WriterSplitInput = {
  name: string;
  percent: number;
};

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

function mapRows(data: unknown): WriterSplit[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      const r = row as Record<string, unknown>;
      const name =
        typeof r.writer_name === "string" ? r.writer_name.trim() : "";
      const pct = Number(r.share_percent);
      if (!name || !Number.isFinite(pct)) return null;
      return {
        id: r.id == null ? null : Number(r.id),
        writer_name: name,
        share_percent: Math.round(pct * 100) / 100,
        sort_order: Number(r.sort_order) || 0,
      } satisfies WriterSplit;
    })
    .filter((x): x is WriterSplit => Boolean(x))
    .sort((a, b) => a.sort_order - b.sort_order || a.writer_name.localeCompare(b.writer_name));
}

/** Public/owner-readable writer credits for one track. */
export async function loadTrackWriterSplits(
  supabase: SupabaseClient,
  trackId: string,
): Promise<{
  writers: WriterSplit[];
  missingTable: boolean;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("track_writer_splits")
      .select("id, writer_name, share_percent, sort_order")
      .eq("track_id", trackId)
      .order("sort_order", { ascending: true });

    if (error) {
      if (isMissingRelation(error.message)) {
        return { writers: [], missingTable: true, error: null };
      }
      return { writers: [], missingTable: false, error: error.message };
    }

    return { writers: mapRows(data), missingTable: false, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load writers";
    return {
      writers: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

/** Batch load splits for Studio catalog. */
export async function loadWriterSplitsForTracks(
  supabase: SupabaseClient,
  trackIds: string[],
): Promise<{
  byTrackId: Record<string, WriterSplit[]>;
  missingTable: boolean;
  error: string | null;
}> {
  const ids = [...new Set(trackIds.filter(Boolean))];
  if (ids.length === 0) {
    return { byTrackId: {}, missingTable: false, error: null };
  }

  try {
    const { data, error } = await supabase
      .from("track_writer_splits")
      .select("id, track_id, writer_name, share_percent, sort_order")
      .in("track_id", ids)
      .order("sort_order", { ascending: true });

    if (error) {
      if (isMissingRelation(error.message)) {
        return { byTrackId: {}, missingTable: true, error: null };
      }
      return { byTrackId: {}, missingTable: false, error: error.message };
    }

    const byTrackId: Record<string, WriterSplit[]> = {};
    for (const raw of data ?? []) {
      const trackId =
        typeof (raw as { track_id?: unknown }).track_id === "string"
          ? (raw as { track_id: string }).track_id
          : null;
      if (!trackId) continue;
      const mapped = mapRows([raw])[0];
      if (!mapped) continue;
      if (!byTrackId[trackId]) byTrackId[trackId] = [];
      byTrackId[trackId].push(mapped);
    }
    for (const list of Object.values(byTrackId)) {
      list.sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.writer_name.localeCompare(b.writer_name),
      );
    }
    return { byTrackId, missingTable: false, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load writers";
    return {
      byTrackId: {},
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

export function validateWriterInputs(
  writers: WriterSplitInput[],
): { ok: true; writers: WriterSplitInput[] } | { ok: false; error: string } {
  if (!Array.isArray(writers) || writers.length < 1) {
    return { ok: false, error: "Writer splits are required." };
  }
  const cleaned: WriterSplitInput[] = [];
  let total = 0;
  for (const w of writers) {
    const name = typeof w.name === "string" ? w.name.trim().slice(0, 120) : "";
    const percent = Number(w.percent);
    if (!name) return { ok: false, error: "Each writer needs a name." };
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return { ok: false, error: "Each split must be between 0 and 100%." };
    }
    const rounded = Math.round(percent * 100) / 100;
    cleaned.push({ name, percent: rounded });
    total += rounded;
  }
  if (Math.abs(total - 100) > 0.01) {
    return { ok: false, error: "Writer splits must total 100%." };
  }
  return { ok: true, writers: cleaned };
}

export async function setTrackWriterSplits(
  supabase: SupabaseClient,
  trackId: string,
  writers: WriterSplitInput[],
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "not_owner"
        | "track_not_found"
        | "missing_table"
        | "validation"
        | "failed";
    }
> {
  const checked = validateWriterInputs(writers);
  if (!checked.ok) {
    return { ok: false, error: checked.error, code: "validation" };
  }

  const { error } = await supabase.rpc("set_track_writer_splits", {
    p_track_id: trackId,
    p_writers: checked.writers.map((w) => ({
      name: w.name,
      percent: w.percent,
    })),
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error:
          "Run 20260810_phase1_track_live_status.sql in Supabase (track_writer_splits).",
        code: "missing_table",
      };
    }
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    if (/not_owner/i.test(error.message)) {
      return { ok: false, error: "Only the track owner can edit writers", code: "not_owner" };
    }
    if (/track_not_found/i.test(error.message)) {
      return { ok: false, error: "Track not found", code: "track_not_found" };
    }
    if (/splits_must_total_100/i.test(error.message)) {
      return { ok: false, error: "Writer splits must total 100%.", code: "validation" };
    }
    if (/writer_name_required|writers_required|invalid_percent/i.test(error.message)) {
      return { ok: false, error: "Invalid writer splits.", code: "validation" };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  return { ok: true };
}

export function formatWriterCredits(writers: WriterSplit[]): string {
  if (writers.length === 0) return "";
  return writers
    .map((w) => `${w.writer_name} ${w.share_percent}%`)
    .join(" · ");
}
