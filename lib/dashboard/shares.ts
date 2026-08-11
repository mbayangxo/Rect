import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBlockedEitherIds } from "@/lib/dashboard/blocks";
import {
  loadFollowedPeople,
  type FollowedPerson,
} from "@/lib/dashboard/people-follows";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export const SHARE_NOTE_MAX = 140;
export const SHARE_THANKS_MAX = 280;

export type ShareRecipient = Pick<
  FollowedPerson,
  "id" | "display_name" | "avatar_url"
>;

export async function loadShareRecipients(
  supabase: SupabaseClient,
  userId: string,
  limit = 40,
): Promise<{
  recipients: ShareRecipient[];
  missingTable: boolean;
  error: string | null;
}> {
  const [result, blocked] = await Promise.all([
    loadFollowedPeople(supabase, userId, limit),
    loadBlockedEitherIds(supabase, userId),
  ]);
  const blockedSet = new Set(blocked.ids);
  return {
    recipients: result.people
      .filter((p) => !blockedSet.has(p.id))
      .map((p) => ({
        id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      })),
    missingTable: result.missingTable,
    error: result.error,
  };
}

export type SendShareResult =
  | {
      ok: true;
      skipped?: string;
      recipient_id: string;
      kind: "track_share" | "playlist_share";
    }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "cannot_share_self"
        | "not_following"
        | "track_not_found"
        | "playlist_not_found"
        | "playlist_private"
        | "blocked"
        | "missing_table"
        | "failed";
    };

function normalizeNote(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  return trimmed.length > SHARE_NOTE_MAX
    ? trimmed.slice(0, SHARE_NOTE_MAX)
    : trimmed;
}

export async function sendTrackShare(
  supabase: SupabaseClient,
  recipientId: string,
  trackId: string,
  note?: string | null,
): Promise<SendShareResult> {
  const to = recipientId.trim();
  const tid = trackId.trim();
  if (!to || !tid) {
    return { ok: false, error: "recipient and track required", code: "failed" };
  }

  const { data, error } = await supabase.rpc("notify_track_share", {
    p_recipient_id: to,
    p_track_id: tid,
    p_note: normalizeNote(note),
  });

  if (error) {
    return mapShareError(error.message, "track_share", to);
  }

  const row = data as { skipped?: string } | null;
  return {
    ok: true,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
    recipient_id: to,
    kind: "track_share",
  };
}

export async function sendPlaylistShare(
  supabase: SupabaseClient,
  recipientId: string,
  playlistId: string,
  note?: string | null,
): Promise<SendShareResult> {
  const to = recipientId.trim();
  const pid = playlistId.trim();
  if (!to || !pid) {
    return {
      ok: false,
      error: "recipient and playlist required",
      code: "failed",
    };
  }

  const { data, error } = await supabase.rpc("notify_playlist_share", {
    p_recipient_id: to,
    p_playlist_id: pid,
    p_note: normalizeNote(note),
  });

  if (error) {
    return mapShareError(error.message, "playlist_share", to);
  }

  const row = data as { skipped?: string } | null;
  return {
    ok: true,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
    recipient_id: to,
    kind: "playlist_share",
  };
}

function mapShareError(
  message: string,
  kind: "track_share" | "playlist_share",
  recipientId: string,
): SendShareResult {
  if (isMissingRelation(message)) {
    return {
      ok: false,
      error: "Run send-to-friend SQL in Supabase first",
      code: "missing_table",
    };
  }
  if (/not_authenticated/i.test(message)) {
    return {
      ok: false,
      error: "Sign in required",
      code: "not_authenticated",
    };
  }
  if (/cannot_share_self/i.test(message)) {
    return {
      ok: false,
      error: "You can’t send this to yourself",
      code: "cannot_share_self",
    };
  }
  if (/not_following/i.test(message)) {
    return {
      ok: false,
      error: "Follow them on People first",
      code: "not_following",
    };
  }
  if (/track_not_found/i.test(message)) {
    return { ok: false, error: "Track not found", code: "track_not_found" };
  }
  if (/playlist_not_found/i.test(message)) {
    return {
      ok: false,
      error: "Playlist not found",
      code: "playlist_not_found",
    };
  }
  if (/playlist_private/i.test(message)) {
    return {
      ok: false,
      error: "Only public playlists can be sent",
      code: "playlist_private",
    };
  }
  if (/blocked/i.test(message)) {
    return {
      ok: false,
      error: "You can’t send to this person",
      code: "blocked",
    };
  }
  void kind;
  void recipientId;
  return { ok: false, error: message, code: "failed" };
}

export async function sendShareThanks(
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
        | "not_a_share"
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
  if (!message || message.length > SHARE_THANKS_MAX) {
    return {
      ok: false,
      error: `Thanks must be 1–${SHARE_THANKS_MAX} characters`,
      code: "invalid_message",
    };
  }

  const { data, error } = await supabase.rpc("send_share_thanks", {
    p_notification_id: notificationId,
    p_message: message,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run share thanks SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/notification_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Share not found",
        code: "notification_not_found",
      };
    }
    if (/not_recipient/i.test(error.message)) {
      return {
        ok: false,
        error: "Only the recipient can thank",
        code: "not_recipient",
      };
    }
    if (/not_a_share/i.test(error.message)) {
      return {
        ok: false,
        error: "Not a share notification",
        code: "not_a_share",
      };
    }
    if (/already_thanked/i.test(error.message)) {
      return {
        ok: false,
        error: "You already thanked for this share",
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
