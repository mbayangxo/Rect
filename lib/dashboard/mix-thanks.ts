import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export const MIX_THANKS_MAX = 280;

export async function sendMixThanks(
  supabase: SupabaseClient,
  playlistId: string,
  message: string,
): Promise<{
  ok: boolean;
  thanks_message?: string;
  playlist_id?: string;
  skipped?: string;
  error?: string;
  code?: string;
}> {
  const id = playlistId.trim();
  if (!id) {
    return {
      ok: false,
      error: "playlist_id required",
      code: "playlist_required",
    };
  }

  const trimmed = message.trim();
  if (!trimmed || trimmed.length > MIX_THANKS_MAX) {
    return {
      ok: false,
      error: `Thanks must be 1–${MIX_THANKS_MAX} characters`,
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

  const { data, error } = await supabase.rpc("send_mix_thanks", {
    p_playlist_id: id,
    p_message: trimmed,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run mix activity thanks SQL in Supabase first",
        code: "missing_table",
      };
    }
    const msg = error.message || "Failed to send thanks";
    const code = /not_authenticated/i.test(msg)
      ? "not_authenticated"
      : /playlist_not_found/i.test(msg)
        ? "playlist_not_found"
        : /cannot_thank_self/i.test(msg)
          ? "cannot_thank_self"
          : /not_following/i.test(msg)
            ? "not_following"
            : /playlist_private/i.test(msg)
              ? "playlist_private"
              : /blocked/i.test(msg)
                ? "blocked"
                : /message_required|playlist_required/i.test(msg)
                  ? "invalid_message"
                  : "failed";
    return { ok: false, error: msg, code };
  }

  const row = data as {
    thanks_message?: string;
    playlist_id?: string;
    skipped?: string;
  } | null;

  return {
    ok: true,
    thanks_message:
      (typeof row?.thanks_message === "string" && row.thanks_message.trim()) ||
      trimmed,
    playlist_id:
      typeof row?.playlist_id === "string" ? row.playlist_id : id,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

/** Map playlist_id → thanks message for the current thanker. */
export async function loadMyMixThanksMap(
  supabase: SupabaseClient,
  thankerId: string,
  playlistIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(playlistIds.map((p) => p.trim()).filter(Boolean))];
  if (!thankerId || ids.length === 0) return map;

  try {
    const { data, error } = await supabase
      .from("mix_thanks")
      .select("playlist_id, message")
      .eq("thanker_id", thankerId)
      .in("playlist_id", ids);

    if (error) return map;

    for (const r of data ?? []) {
      const pid = typeof r.playlist_id === "string" ? r.playlist_id : "";
      const msg =
        typeof r.message === "string" && r.message.trim()
          ? r.message.trim()
          : "";
      if (pid && msg) map.set(pid, msg);
    }
  } catch {
    /* soft */
  }
  return map;
}
