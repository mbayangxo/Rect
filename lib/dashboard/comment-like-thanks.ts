import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export const COMMENT_LIKE_THANKS_MAX = 280;

export async function sendCommentLikeThanks(
  supabase: SupabaseClient,
  notificationId: number,
  messageRaw: string,
): Promise<
  | {
      ok: true;
      notification_id: number;
      thanks_message: string;
      skipped?: string;
    }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "missing_table"
        | "notification_not_found"
        | "not_recipient"
        | "not_a_comment_like"
        | "already_thanked"
        | "blocked"
        | "invalid_message"
        | "failed";
    }
> {
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

  const message = messageRaw.replace(/\s+/g, " ").trim();
  if (!message || message.length > COMMENT_LIKE_THANKS_MAX) {
    return {
      ok: false,
      error: `Thanks must be 1–${COMMENT_LIKE_THANKS_MAX} characters`,
      code: "invalid_message",
    };
  }

  const { data, error } = await supabase.rpc("send_comment_like_thanks", {
    p_notification_id: notificationId,
    p_message: message,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run comment like thanks SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/notification_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Like notification not found",
        code: "notification_not_found",
      };
    }
    if (/not_recipient/i.test(error.message)) {
      return {
        ok: false,
        error: "Only the comment author can thank",
        code: "not_recipient",
      };
    }
    if (/not_a_comment_like/i.test(error.message)) {
      return {
        ok: false,
        error: "Not a comment like notification",
        code: "not_a_comment_like",
      };
    }
    if (/already_thanked/i.test(error.message)) {
      return {
        ok: false,
        error: "You already thanked for this like",
        code: "already_thanked",
      };
    }
    if (/blocked/i.test(error.message)) {
      return {
        ok: false,
        error: "You can’t thank this person",
        code: "blocked",
      };
    }
    if (/message_required/i.test(error.message)) {
      return {
        ok: false,
        error: "Write a short thank-you",
        code: "invalid_message",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as {
    thanks_message?: string;
    notification_id?: number;
    skipped?: string;
  } | null;

  return {
    ok: true,
    notification_id: Number(row?.notification_id ?? notificationId),
    thanks_message:
      (typeof row?.thanks_message === "string" && row.thanks_message.trim()) ||
      message,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}
