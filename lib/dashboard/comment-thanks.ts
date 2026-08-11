import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export const COMMENT_THANKS_MAX = 280;

export async function sendCommentThanks(
  supabase: SupabaseClient,
  commentId: number,
  message: string,
): Promise<{
  ok: boolean;
  thanks_message?: string;
  comment_id?: number;
  skipped?: string;
  error?: string;
  code?: string;
}> {
  if (!Number.isFinite(commentId) || commentId <= 0) {
    return {
      ok: false,
      error: "comment_id required",
      code: "comment_required",
    };
  }

  const trimmed = message.trim();
  if (!trimmed || trimmed.length > COMMENT_THANKS_MAX) {
    return {
      ok: false,
      error: `Thanks must be 1–${COMMENT_THANKS_MAX} characters`,
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

  const { data, error } = await supabase.rpc("send_comment_thanks", {
    p_comment_id: commentId,
    p_message: trimmed,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run comment thanks SQL in Supabase first",
        code: "missing_table",
      };
    }
    const msg = error.message || "Failed to send thanks";
    const code = /not_authenticated/i.test(msg)
      ? "not_authenticated"
      : /comment_not_found/i.test(msg)
        ? "comment_not_found"
        : /cannot_thank_self/i.test(msg)
          ? "cannot_thank_self"
          : /not_track_owner|not_allowed/i.test(msg)
            ? "not_allowed"
            : /blocked/i.test(msg)
              ? "blocked"
              : /message_required|comment_required/i.test(msg)
                ? "invalid_message"
                : "failed";
    return { ok: false, error: msg, code };
  }

  const row = data as {
    thanks_message?: string;
    comment_id?: number;
    skipped?: string;
  } | null;

  return {
    ok: true,
    thanks_message:
      (typeof row?.thanks_message === "string" && row.thanks_message.trim()) ||
      trimmed,
    comment_id:
      typeof row?.comment_id === "number" && Number.isFinite(row.comment_id)
        ? row.comment_id
        : commentId,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

/** Map comment_id → thanks message for the current thanker. */
export async function loadMyCommentThanksMap(
  supabase: SupabaseClient,
  thankerId: string,
  commentIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const ids = [
    ...new Set(
      commentIds.filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  if (!thankerId || ids.length === 0) return map;

  try {
    const { data, error } = await supabase
      .from("comment_thanks")
      .select("comment_id, message")
      .eq("thanker_id", thankerId)
      .in("comment_id", ids);

    if (error) return map;

    for (const r of data ?? []) {
      const cid = Number(r.comment_id);
      const msg =
        typeof r.message === "string" && r.message.trim()
          ? r.message.trim()
          : "";
      if (Number.isFinite(cid) && msg) map.set(cid, msg);
    }
  } catch {
    /* soft */
  }
  return map;
}
