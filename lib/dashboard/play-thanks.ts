import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export const PLAY_THANKS_MAX = 280;

export async function sendPlayThanks(
  supabase: SupabaseClient,
  playId: string,
  message: string,
): Promise<{
  ok: boolean;
  thanks_message?: string;
  play_id?: string;
  skipped?: string;
  error?: string;
  code?: string;
}> {
  const id = playId.trim();
  if (!id) {
    return { ok: false, error: "play_id required", code: "play_required" };
  }

  const trimmed = message.trim();
  if (!trimmed || trimmed.length > PLAY_THANKS_MAX) {
    return {
      ok: false,
      error: `Thanks must be 1–${PLAY_THANKS_MAX} characters`,
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

  const { data, error } = await supabase.rpc("send_play_thanks", {
    p_play_id: id,
    p_message: trimmed,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run play activity thanks SQL in Supabase first",
        code: "missing_table",
      };
    }
    const msg = error.message || "Failed to send thanks";
    const code = /not_authenticated/i.test(msg)
      ? "not_authenticated"
      : /play_not_found/i.test(msg)
        ? "play_not_found"
        : /cannot_thank_self/i.test(msg)
          ? "cannot_thank_self"
          : /not_following/i.test(msg)
            ? "not_following"
            : /privacy/i.test(msg)
              ? "privacy"
              : /blocked/i.test(msg)
                ? "blocked"
                : /message_required/i.test(msg)
                  ? "invalid_message"
                  : "failed";
    return { ok: false, error: msg, code };
  }

  const row = data as {
    thanks_message?: string;
    play_id?: string;
    skipped?: string;
  } | null;

  return {
    ok: true,
    thanks_message:
      (typeof row?.thanks_message === "string" && row.thanks_message.trim()) ||
      trimmed,
    play_id: typeof row?.play_id === "string" ? row.play_id : id,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

/** Map play_id → thanks message for the current thanker. */
export async function loadMyPlayThanksMap(
  supabase: SupabaseClient,
  thankerId: string,
  playIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(playIds.map((p) => p.trim()).filter(Boolean))];
  if (!thankerId || ids.length === 0) return map;

  try {
    const { data, error } = await supabase
      .from("play_thanks")
      .select("play_id, listener_id, track_id, message")
      .eq("thanker_id", thankerId)
      .in("play_id", ids);

    if (!error) {
      for (const r of data ?? []) {
        const pid = typeof r.play_id === "string" ? r.play_id : "";
        const msg =
          typeof r.message === "string" && r.message.trim()
            ? r.message.trim()
            : "";
        if (pid && msg) map.set(pid, msg);
      }
    }

    // Cover owner thanks stored on an earlier play for same listener+track
    const missing = ids.filter((id) => !map.has(id));
    if (missing.length === 0) return map;

    const plays = await supabase
      .from("plays")
      .select("id, listener_id, track_id")
      .in("id", missing);
    if (plays.error || !plays.data?.length) return map;

    const tracks = [
      ...new Set(
        plays.data
          .map((p) =>
            typeof p.track_id === "string" ? p.track_id.trim() : "",
          )
          .filter(Boolean),
      ),
    ];
    if (tracks.length === 0) return map;

    const thanks = await supabase
      .from("play_thanks")
      .select("listener_id, track_id, message")
      .eq("thanker_id", thankerId)
      .in("track_id", tracks);
    if (thanks.error) return map;

    const byPair = new Map<string, string>();
    for (const t of thanks.data ?? []) {
      const lid = typeof t.listener_id === "string" ? t.listener_id : "";
      const tid =
        typeof t.track_id === "string" ? t.track_id.trim() : "";
      const msg =
        typeof t.message === "string" && t.message.trim()
          ? t.message.trim()
          : "";
      if (lid && tid && msg) byPair.set(`${lid}:${tid}`, msg);
    }

    for (const p of plays.data) {
      const pid = p.id != null ? String(p.id) : "";
      if (!pid || map.has(pid)) continue;
      const lid = typeof p.listener_id === "string" ? p.listener_id : "";
      const tid =
        typeof p.track_id === "string" ? p.track_id.trim() : "";
      const msg = lid && tid ? byPair.get(`${lid}:${tid}`) : undefined;
      if (msg) map.set(pid, msg);
    }
  } catch {
    /* soft */
  }
  return map;
}
