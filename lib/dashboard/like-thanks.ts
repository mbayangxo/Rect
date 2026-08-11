import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export const LIKE_THANKS_MAX = 280;

export function likeThanksKey(likerId: string, trackId: string) {
  return `${likerId.trim()}:${trackId.trim()}`;
}

export async function sendLikeThanks(
  supabase: SupabaseClient,
  likerId: string,
  trackId: string,
  message: string,
): Promise<{
  ok: boolean;
  thanks_message?: string;
  liker_id?: string;
  track_id?: string;
  skipped?: string;
  error?: string;
  code?: string;
}> {
  const liker = likerId.trim();
  const track = trackId.trim();
  if (!liker) {
    return { ok: false, error: "liker_id required", code: "liker_required" };
  }
  if (!track) {
    return { ok: false, error: "track_id required", code: "track_required" };
  }

  const trimmed = message.trim();
  if (!trimmed || trimmed.length > LIKE_THANKS_MAX) {
    return {
      ok: false,
      error: `Thanks must be 1–${LIKE_THANKS_MAX} characters`,
      code: "invalid_message",
    };
  }

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

  const { data, error } = await supabase.rpc("send_like_thanks", {
    p_liker_id: liker,
    p_track_id: track,
    p_message: trimmed,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run like activity thanks SQL in Supabase first",
        code: "missing_table",
      };
    }
    const msg = error.message || "Failed to send thanks";
    const code = /not_authenticated/i.test(msg)
      ? "not_authenticated"
      : /like_not_found|track_not_found/i.test(msg)
        ? "like_not_found"
        : /cannot_thank_self/i.test(msg)
          ? "cannot_thank_self"
          : /not_following/i.test(msg)
            ? "not_following"
            : /privacy/i.test(msg)
              ? "privacy"
              : /blocked/i.test(msg)
                ? "blocked"
                : /message_required|liker_required|track_required/i.test(msg)
                  ? "invalid_message"
                  : "failed";
    return { ok: false, error: msg, code };
  }

  const row = data as {
    thanks_message?: string;
    liker_id?: string;
    track_id?: string;
    skipped?: string;
  } | null;

  return {
    ok: true,
    thanks_message:
      (typeof row?.thanks_message === "string" && row.thanks_message.trim()) ||
      trimmed,
    liker_id: typeof row?.liker_id === "string" ? row.liker_id : liker,
    track_id: typeof row?.track_id === "string" ? row.track_id : track,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

/** Map `${liker_id}:${track_id}` → thanks message for the current thanker. */
export async function loadMyLikeThanksMap(
  supabase: SupabaseClient,
  thankerId: string,
  pairs: { likerId: string; trackId: string }[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!thankerId || pairs.length === 0) return map;

  const trackIds = [
    ...new Set(pairs.map((p) => p.trackId.trim()).filter(Boolean)),
  ];
  if (trackIds.length === 0) return map;

  try {
    const { data, error } = await supabase
      .from("like_thanks")
      .select("liker_id, track_id, message")
      .eq("thanker_id", thankerId)
      .in("track_id", trackIds);

    if (error) return map;

    const wanted = new Set(
      pairs.map((p) => likeThanksKey(p.likerId, p.trackId)),
    );

    for (const r of data ?? []) {
      const liker = typeof r.liker_id === "string" ? r.liker_id : "";
      const track = typeof r.track_id === "string" ? r.track_id : "";
      const key = likeThanksKey(liker, track);
      if (!wanted.has(key)) continue;
      const msg =
        typeof r.message === "string" && r.message.trim()
          ? r.message.trim()
          : "";
      if (msg) map.set(key, msg);
    }
  } catch {
    /* soft */
  }
  return map;
}
