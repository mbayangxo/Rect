import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBlockedEitherIds } from "@/lib/dashboard/blocks";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type ArtistNotification = {
  id: number;
  kind:
    | "follow"
    | "tip"
    | "release"
    | "like"
    | "listen"
    | "comment"
    | "people_follow"
    | "playlist_follow"
    | "track_share"
    | "playlist_share"
    | "comment_reply"
    | "tip_thanks"
    | "share_thanks"
    | "playlist_follow_thanks"
    | "playlist_copy_thanks"
    | "people_follow_thanks"
    | "follow_thanks"
    | "comment_like_thanks"
    | "playlist_comment_like_thanks"
    | "activity_thanks"
    | "like_thanks"
    | "comment_thanks"
    | "playlist_comment_thanks"
    | "mix_thanks"
    | "friend_mix"
    | "playlist_copy"
    | "playlist_collab_invite"
    | "playlist_collab_accepted"
    | "playlist_collab_add"
    | "playlist_collab_declined"
    | "playlist_collab_left"
    | "playlist_collab_removed"
    | "playlist_collab_request"
    | "comment_like"
    | "playlist_track_add"
    | "playlist_comment"
    | "playlist_comment_reply"
    | "playlist_comment_like"
    | string;
  amount_xof: number | null;
  body: string | null;
  track_id: string | null;
  /** Hydrated from tracks when track_id is set. */
  track_title: string | null;
  playlist_id: string | null;
  /** Hydrated from playlists when playlist_id is set. */
  playlist_name: string | null;
  /** Copier's mix for playlist_copy (private; recipient can open via RLS). */
  related_playlist_id: string | null;
  tip_id: number | null;
  tip_thanks_message: string | null;
  /** Thanks you sent on share / follow / comment-like notification rows. */
  share_thanks_message: string | null;
  /** Play row for listen notifs (artist Nice). */
  play_id: string | null;
  /** Track comment id for comment notifs (artist Nice). */
  comment_id: number | null;
  /** Playlist comment id for mix comment notifs (owner Nice). */
  playlist_comment_id: number | null;
  actor_id: string | null;
  actor_name: string;
  read_at: string | null;
  created_at: string | null;
};

export type NotificationsLoadResult = {
  notifications: ArtistNotification[];
  unreadCount: number;
  missingTable: boolean;
  error: string | null;
};

export async function notifyArtist(
  supabase: SupabaseClient,
  recipientId: string,
  kind: "follow" | "tip",
  opts?: {
    amount_xof?: number;
    body?: string;
    track_id?: string | null;
    tip_id?: number | null;
  },
): Promise<{ ok: boolean; missingTable?: boolean }> {
  const trackId =
    typeof opts?.track_id === "string" && opts.track_id.trim()
      ? opts.track_id.trim()
      : null;
  const tipId =
    typeof opts?.tip_id === "number" && Number.isFinite(opts.tip_id)
      ? opts.tip_id
      : null;

  let { error } = await supabase.rpc("notify_artist", {
    p_recipient_id: recipientId,
    p_kind: kind,
    p_amount_xof: opts?.amount_xof ?? null,
    p_body: opts?.body ?? null,
    p_track_id: trackId,
    p_tip_id: tipId,
  });

  if (
    error &&
    tipId != null &&
    /p_tip_id|tip_id|Could not find the function|PGRST202/i.test(error.message)
  ) {
    const retry = await supabase.rpc("notify_artist", {
      p_recipient_id: recipientId,
      p_kind: kind,
      p_amount_xof: opts?.amount_xof ?? null,
      p_body: opts?.body ?? null,
      p_track_id: trackId,
    });
    error = retry.error;
  }

  if (
    error &&
    trackId &&
    /p_track_id|track_id|Could not find the function|PGRST202/i.test(
      error.message,
    )
  ) {
    const retry = await supabase.rpc("notify_artist", {
      p_recipient_id: recipientId,
      p_kind: kind,
      p_amount_xof: opts?.amount_xof ?? null,
      p_body: opts?.body ?? null,
    });
    error = retry.error;
  }

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, missingTable: true };
    }
    // Soft-fail — tip/follow already succeeded
    return { ok: false };
  }
  return { ok: true };
}

/** Soft-notify when a peer follows you on /people. */
export async function notifyPeopleFollow(
  supabase: SupabaseClient,
  personId: string,
): Promise<{ ok: boolean; skipped?: string; missingTable?: boolean }> {
  const { data, error } = await supabase.rpc("notify_people_follow", {
    p_person_id: personId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, missingTable: true };
    }
    return { ok: false };
  }

  const row = data as { skipped?: string } | null;
  return {
    ok: true,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

export async function notifyTrackRelease(
  supabase: SupabaseClient,
  trackId: string,
): Promise<{ ok: boolean; notified: number; missingTable?: boolean }> {
  const { data, error } = await supabase.rpc("notify_track_release", {
    p_track_id: trackId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, notified: 0, missingTable: true };
    }
    return { ok: false, notified: 0 };
  }

  const row = data as { notified?: number } | null;
  return { ok: true, notified: Number(row?.notified) || 0 };
}

/** Soft-notify artist when a fan likes their track. */
export async function notifyTrackLike(
  supabase: SupabaseClient,
  trackId: string,
): Promise<{ ok: boolean; skipped?: string; missingTable?: boolean }> {
  const { data, error } = await supabase.rpc("notify_track_like", {
    p_track_id: trackId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, missingTable: true };
    }
    // Soft-fail — like already succeeded
    return { ok: false };
  }

  const row = data as { skipped?: string } | null;
  return {
    ok: true,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

/** Soft-notify artist when an opted-in fan plays their track. */
export async function notifyTrackListen(
  supabase: SupabaseClient,
  trackId: string,
  playId?: string | null,
): Promise<{ ok: boolean; skipped?: string; missingTable?: boolean }> {
  const args: { p_track_id: string; p_play_id?: string } = {
    p_track_id: trackId,
  };
  if (playId && playId.trim()) {
    args.p_play_id = playId.trim();
  }

  let { data, error } = await supabase.rpc("notify_track_listen", args);

  // Older one-arg RPC before artist_listen_thanks migration
  if (
    error &&
    args.p_play_id &&
    /p_play_id|Could not find the function|PGRST202/i.test(error.message)
  ) {
    const fallback = await supabase.rpc("notify_track_listen", {
      p_track_id: trackId,
    });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, missingTable: true };
    }
    // Soft-fail — play already succeeded
    return { ok: false };
  }

  const row = data as { skipped?: string } | null;
  return {
    ok: true,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

/** Soft-notify artist when someone comments on their track. */
export async function notifyTrackComment(
  supabase: SupabaseClient,
  trackId: string,
  preview?: string,
  commentId?: number | null,
): Promise<{ ok: boolean; skipped?: string; missingTable?: boolean }> {
  const args: {
    p_track_id: string;
    p_comment_preview?: string | null;
    p_comment_id?: number;
  } = {
    p_track_id: trackId,
    p_comment_preview: preview?.slice(0, 200) ?? null,
  };
  if (
    typeof commentId === "number" &&
    Number.isFinite(commentId) &&
    commentId > 0
  ) {
    args.p_comment_id = commentId;
  }

  let { data, error } = await supabase.rpc("notify_track_comment", args);

  // Older two-arg RPC before comment_thanks migration
  if (
    error &&
    args.p_comment_id != null &&
    /p_comment_id|Could not find the function|PGRST202/i.test(error.message)
  ) {
    const fallback = await supabase.rpc("notify_track_comment", {
      p_track_id: trackId,
      p_comment_preview: args.p_comment_preview,
    });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, missingTable: true };
    }
    return { ok: false };
  }

  const row = data as { skipped?: string } | null;
  return {
    ok: true,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

/** Soft-notify parent comment author when someone replies. */
export async function notifyCommentReply(
  supabase: SupabaseClient,
  parentCommentId: number,
  preview?: string,
  replyCommentId?: number,
): Promise<{ ok: boolean; skipped?: string; missingTable?: boolean }> {
  const args: {
    p_parent_comment_id: number;
    p_reply_preview: string | null;
    p_reply_comment_id?: number;
  } = {
    p_parent_comment_id: parentCommentId,
    p_reply_preview: preview?.slice(0, 200) ?? null,
  };
  if (replyCommentId != null && Number.isFinite(replyCommentId)) {
    args.p_reply_comment_id = replyCommentId;
  }

  let { data, error } = await supabase.rpc("notify_comment_reply", args);

  if (
    error &&
    args.p_reply_comment_id != null &&
    /p_reply_comment_id|Could not find the function|PGRST202/i.test(
      error.message,
    )
  ) {
    const fallback = await supabase.rpc("notify_comment_reply", {
      p_parent_comment_id: parentCommentId,
      p_reply_preview: preview?.slice(0, 200) ?? null,
    });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, missingTable: true };
    }
    return { ok: false };
  }

  const row = data as { skipped?: string } | null;
  return {
    ok: true,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

/** Soft-notify people who follow you when you publish a mix. */
export async function notifyFriendMixPublished(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{ ok: boolean; notified: number; missingTable?: boolean }> {
  const { data, error } = await supabase.rpc("notify_friend_mix_published", {
    p_playlist_id: playlistId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, notified: 0, missingTable: true };
    }
    return { ok: false, notified: 0 };
  }

  const row = data as { notified?: number } | null;
  return { ok: true, notified: Number(row?.notified) || 0 };
}

/** Soft-notify people who saved a playlist when a track is added. */
export async function notifyPlaylistFollowersTrackAdd(
  supabase: SupabaseClient,
  playlistId: string,
  trackId: string,
): Promise<{ ok: boolean; notified: number; missingTable?: boolean }> {
  const { data, error } = await supabase.rpc(
    "notify_playlist_followers_track_add",
    {
      p_playlist_id: playlistId,
      p_track_id: trackId,
    },
  );

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, notified: 0, missingTable: true };
    }
    return { ok: false, notified: 0 };
  }

  const row = data as { notified?: number } | null;
  return { ok: true, notified: Number(row?.notified) || 0 };
}

export async function loadArtistNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 40,
): Promise<NotificationsLoadResult> {
  try {
    const { data, error } = await supabase
      .from("artist_notifications")
      .select(
        "id, kind, amount_xof, body, track_id, playlist_id, related_playlist_id, tip_id, play_id, comment_id, playlist_comment_id, thanks_message, actor_id, read_at, created_at",
      )
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.message)) {
        return {
          notifications: [],
          unreadCount: 0,
          missingTable: true,
          error: null,
        };
      }
      // Older schema without related_playlist_id / playlist_comment_id / …
      if (
        /related_playlist_id|playlist_comment_id|comment_id|play_id|thanks_message|tip_id|playlist_id|track_id|column .* does not exist/i.test(
          error.message,
        )
      ) {
        if (/related_playlist_id/i.test(error.message)) {
          const noRelated = await supabase
            .from("artist_notifications")
            .select(
              "id, kind, amount_xof, body, track_id, playlist_id, tip_id, play_id, comment_id, playlist_comment_id, thanks_message, actor_id, read_at, created_at",
            )
            .eq("recipient_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (!noRelated.error) {
            return mapNotificationRows(supabase, noRelated.data ?? [], userId);
          }
        }
        if (
          /playlist_comment_id/i.test(error.message) &&
          !/comment_id/i.test(error.message.replace(/playlist_comment_id/gi, ""))
        ) {
          const noPc = await supabase
            .from("artist_notifications")
            .select(
              "id, kind, amount_xof, body, track_id, playlist_id, tip_id, play_id, comment_id, thanks_message, actor_id, read_at, created_at",
            )
            .eq("recipient_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (!noPc.error) {
            return mapNotificationRows(supabase, noPc.data ?? [], userId);
          }
        }
        if (/comment_id/i.test(error.message) && !/play_id/i.test(error.message)) {
          const noComment = await supabase
            .from("artist_notifications")
            .select(
              "id, kind, amount_xof, body, track_id, playlist_id, tip_id, play_id, thanks_message, actor_id, read_at, created_at",
            )
            .eq("recipient_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (!noComment.error) {
            return mapNotificationRows(supabase, noComment.data ?? [], userId);
          }
        }
        if (/play_id/i.test(error.message)) {
          const noPlay = await supabase
            .from("artist_notifications")
            .select(
              "id, kind, amount_xof, body, track_id, playlist_id, tip_id, thanks_message, actor_id, read_at, created_at",
            )
            .eq("recipient_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (!noPlay.error) {
            return mapNotificationRows(supabase, noPlay.data ?? [], userId);
          }
        }
        if (/thanks_message/i.test(error.message)) {
          const noThanks = await supabase
            .from("artist_notifications")
            .select(
              "id, kind, amount_xof, body, track_id, playlist_id, tip_id, actor_id, read_at, created_at",
            )
            .eq("recipient_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (!noThanks.error) {
            return mapNotificationRows(supabase, noThanks.data ?? [], userId);
          }
        }
        if (/tip_id/i.test(error.message)) {
          const noTip = await supabase
            .from("artist_notifications")
            .select(
              "id, kind, amount_xof, body, track_id, playlist_id, actor_id, read_at, created_at",
            )
            .eq("recipient_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (!noTip.error) {
            return mapNotificationRows(supabase, noTip.data ?? [], userId);
          }
        }
        const withTrack = await supabase
          .from("artist_notifications")
          .select(
            "id, kind, amount_xof, body, track_id, actor_id, read_at, created_at",
          )
          .eq("recipient_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (
          withTrack.error &&
          /track_id|column .* does not exist/i.test(withTrack.error.message)
        ) {
          const lean = await supabase
            .from("artist_notifications")
            .select("id, kind, amount_xof, body, actor_id, read_at, created_at")
            .eq("recipient_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (lean.error) {
            return {
              notifications: [],
              unreadCount: 0,
              missingTable: false,
              error: lean.error.message,
            };
          }
          return mapNotificationRows(supabase, lean.data ?? [], userId);
        }
        if (withTrack.error) {
          return {
            notifications: [],
            unreadCount: 0,
            missingTable: false,
            error: withTrack.error.message,
          };
        }
        return mapNotificationRows(supabase, withTrack.data ?? [], userId);
      }
      return {
        notifications: [],
        unreadCount: 0,
        missingTable: false,
        error: error.message,
      };
    }

    return mapNotificationRows(supabase, data ?? [], userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load inbox";
    return {
      notifications: [],
      unreadCount: 0,
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

async function mapNotificationRows(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
  viewerId?: string,
): Promise<NotificationsLoadResult> {
  try {
    let filtered = rows;
    if (viewerId) {
      const blocked = await loadBlockedEitherIds(supabase, viewerId);
      if (!blocked.missingTable && blocked.ids.length > 0) {
        const hide = new Set(blocked.ids);
        filtered = rows.filter((r) => {
          const actor = r.actor_id as string | null;
          return !actor || !hide.has(actor);
        });
      }
    }

    const actorIds = [
      ...new Set(
        filtered
          .map((r) => r.actor_id as string | null)
          .filter(Boolean) as string[],
      ),
    ];

    const nameById = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, display_name, privacy_public_profile")
        .in("id", actorIds);
      for (const u of users ?? []) {
        const publicOk =
          (u as { privacy_public_profile?: boolean | null })
            .privacy_public_profile !== false;
        const name =
          publicOk &&
          typeof u.display_name === "string" &&
          u.display_name.trim()
            ? u.display_name.trim()
            : "An artist";
        nameById.set(u.id as string, name);
      }
    }

    const tipIds = [
      ...new Set(
        filtered
          .map((r) =>
            r.tip_id != null && Number.isFinite(Number(r.tip_id))
              ? Number(r.tip_id)
              : null,
          )
          .filter((id): id is number => id != null),
      ),
    ];
    const thanksByTipId = new Map<number, string | null>();
    const trackIdByTipId = new Map<number, string>();
    if (tipIds.length > 0) {
      const tips = await supabase
        .from("artist_tips")
        .select("id, thanks_message, track_id")
        .in("id", tipIds);
      if (
        tips.error &&
        /track_id|column .* does not exist/i.test(tips.error.message)
      ) {
        const lean = await supabase
          .from("artist_tips")
          .select("id, thanks_message")
          .in("id", tipIds);
        if (!lean.error) {
          for (const t of lean.data ?? []) {
            thanksByTipId.set(
              Number(t.id),
              typeof t.thanks_message === "string" && t.thanks_message.trim()
                ? t.thanks_message.trim()
                : null,
            );
          }
        }
      } else if (!tips.error) {
        for (const t of tips.data ?? []) {
          const tipId = Number(t.id);
          thanksByTipId.set(
            tipId,
            typeof t.thanks_message === "string" && t.thanks_message.trim()
              ? t.thanks_message.trim()
              : null,
          );
          if (typeof t.track_id === "string" && t.track_id.trim()) {
            trackIdByTipId.set(tipId, t.track_id.trim());
          }
        }
      }
    }

    const trackIds = [
      ...new Set(
        [
          ...filtered.map((r) =>
            typeof r.track_id === "string" && r.track_id.trim()
              ? r.track_id.trim()
              : null,
          ),
          ...trackIdByTipId.values(),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    const titleByTrackId = new Map<string, string>();
    if (trackIds.length > 0) {
      const tracks = await supabase
        .from("tracks")
        .select("id, title")
        .in("id", trackIds);
      if (!tracks.error) {
        for (const t of tracks.data ?? []) {
          const tid = String(t.id ?? "");
          const title =
            typeof t.title === "string" && t.title.trim() ? t.title.trim() : "";
          if (tid && title) titleByTrackId.set(tid, title);
        }
      }
    }

    const playlistIds = [
      ...new Set(
        filtered
          .flatMap((r) => {
            const ids: string[] = [];
            if (typeof r.playlist_id === "string" && r.playlist_id.trim()) {
              ids.push(r.playlist_id.trim());
            }
            if (
              typeof r.related_playlist_id === "string" &&
              r.related_playlist_id.trim()
            ) {
              ids.push(r.related_playlist_id.trim());
            }
            return ids;
          })
          .filter(Boolean),
      ),
    ];
    const nameByPlaylistId = new Map<string, string>();
    if (playlistIds.length > 0) {
      const playlists = await supabase
        .from("playlists")
        .select("id, name")
        .in("id", playlistIds);
      if (!playlists.error) {
        for (const p of playlists.data ?? []) {
          const pid = String(p.id ?? "");
          const name =
            typeof p.name === "string" && p.name.trim() ? p.name.trim() : "";
          if (pid && name) nameByPlaylistId.set(pid, name);
        }
      }
    }

    // Backfill play_id on listen rows (older notifs / SQL without column)
    const playIdByKey = new Map<string, string>();
    const needPlay: { actor: string; track: string }[] = [];
    const seenNeed = new Set<string>();
    for (const r of filtered) {
      if (String(r.kind) !== "listen") continue;
      const existing =
        typeof r.play_id === "string" && r.play_id.trim()
          ? r.play_id.trim()
          : "";
      if (existing) continue;
      const actor =
        typeof r.actor_id === "string" && r.actor_id.trim()
          ? r.actor_id.trim()
          : "";
      const track =
        typeof r.track_id === "string" && r.track_id.trim()
          ? r.track_id.trim()
          : "";
      if (!actor || !track) continue;
      const key = `${actor}:${track}`;
      if (seenNeed.has(key)) continue;
      seenNeed.add(key);
      needPlay.push({ actor, track });
    }
    if (needPlay.length > 0) {
      const actors = [...new Set(needPlay.map((n) => n.actor))];
      const tracks = [...new Set(needPlay.map((n) => n.track))];
      const plays = await supabase
        .from("plays")
        .select("id, listener_id, track_id, created_at")
        .in("listener_id", actors)
        .in("track_id", tracks)
        .order("created_at", { ascending: false })
        .limit(80);
      if (!plays.error) {
        for (const p of plays.data ?? []) {
          const lid =
            typeof p.listener_id === "string" ? p.listener_id : "";
          const tid =
            typeof p.track_id === "string" ? p.track_id.trim() : "";
          const pid = p.id != null ? String(p.id) : "";
          if (!lid || !tid || !pid) continue;
          const key = `${lid}:${tid}`;
          if (!playIdByKey.has(key)) playIdByKey.set(key, pid);
        }
      }
    }

    // Backfill comment_id on comment rows
    const commentIdByKey = new Map<string, number>();
    const needComment: { actor: string; track: string }[] = [];
    const seenComment = new Set<string>();
    for (const r of filtered) {
      if (String(r.kind) !== "comment") continue;
      if (r.comment_id != null && Number.isFinite(Number(r.comment_id))) {
        continue;
      }
      const actor =
        typeof r.actor_id === "string" && r.actor_id.trim()
          ? r.actor_id.trim()
          : "";
      const track =
        typeof r.track_id === "string" && r.track_id.trim()
          ? r.track_id.trim()
          : "";
      if (!actor || !track) continue;
      const key = `${actor}:${track}`;
      if (seenComment.has(key)) continue;
      seenComment.add(key);
      needComment.push({ actor, track });
    }
    if (needComment.length > 0) {
      const actors = [...new Set(needComment.map((n) => n.actor))];
      const tracks = [...new Set(needComment.map((n) => n.track))];
      const comments = await supabase
        .from("track_comments")
        .select("id, user_id, track_id, created_at")
        .in("user_id", actors)
        .in("track_id", tracks)
        .order("created_at", { ascending: false })
        .limit(80);
      if (!comments.error) {
        for (const c of comments.data ?? []) {
          const uid = typeof c.user_id === "string" ? c.user_id : "";
          const tid =
            typeof c.track_id === "string" ? c.track_id.trim() : "";
          const cid = Number(c.id);
          if (!uid || !tid || !Number.isFinite(cid)) continue;
          const key = `${uid}:${tid}`;
          if (!commentIdByKey.has(key)) commentIdByKey.set(key, cid);
        }
      }
    }

    // Backfill playlist_comment_id on playlist_comment rows
    const playlistCommentIdByKey = new Map<string, number>();
    const needPc: { actor: string; playlist: string }[] = [];
    const seenPc = new Set<string>();
    for (const r of filtered) {
      if (String(r.kind) !== "playlist_comment") continue;
      if (
        r.playlist_comment_id != null &&
        Number.isFinite(Number(r.playlist_comment_id))
      ) {
        continue;
      }
      const actor =
        typeof r.actor_id === "string" && r.actor_id.trim()
          ? r.actor_id.trim()
          : "";
      const playlist =
        typeof r.playlist_id === "string" && r.playlist_id.trim()
          ? r.playlist_id.trim()
          : "";
      if (!actor || !playlist) continue;
      const key = `${actor}:${playlist}`;
      if (seenPc.has(key)) continue;
      seenPc.add(key);
      needPc.push({ actor, playlist });
    }
    if (needPc.length > 0) {
      const actors = [...new Set(needPc.map((n) => n.actor))];
      const playlists = [...new Set(needPc.map((n) => n.playlist))];
      const comments = await supabase
        .from("playlist_comments")
        .select("id, user_id, playlist_id, created_at")
        .in("user_id", actors)
        .in("playlist_id", playlists)
        .order("created_at", { ascending: false })
        .limit(80);
      if (!comments.error) {
        for (const c of comments.data ?? []) {
          const uid = typeof c.user_id === "string" ? c.user_id : "";
          const pid =
            typeof c.playlist_id === "string"
              ? c.playlist_id.trim()
              : String(c.playlist_id ?? "");
          const cid = Number(c.id);
          if (!uid || !pid || !Number.isFinite(cid)) continue;
          const key = `${uid}:${pid}`;
          if (!playlistCommentIdByKey.has(key)) {
            playlistCommentIdByKey.set(key, cid);
          }
        }
      }
    }

    // Backfill reply ids for comment_reply / playlist_comment_reply
    const replyCommentIdByKey = new Map<string, number>();
    const needReply: { actor: string; track: string }[] = [];
    const seenReply = new Set<string>();
    for (const r of filtered) {
      if (String(r.kind) !== "comment_reply") continue;
      if (r.comment_id != null && Number.isFinite(Number(r.comment_id))) {
        continue;
      }
      const actor =
        typeof r.actor_id === "string" && r.actor_id.trim()
          ? r.actor_id.trim()
          : "";
      const track =
        typeof r.track_id === "string" && r.track_id.trim()
          ? r.track_id.trim()
          : "";
      if (!actor || !track) continue;
      const key = `${actor}:${track}`;
      if (seenReply.has(key)) continue;
      seenReply.add(key);
      needReply.push({ actor, track });
    }
    if (needReply.length > 0) {
      const actors = [...new Set(needReply.map((n) => n.actor))];
      const tracks = [...new Set(needReply.map((n) => n.track))];
      const replies = await supabase
        .from("track_comments")
        .select("id, user_id, track_id, parent_id, created_at")
        .in("user_id", actors)
        .in("track_id", tracks)
        .not("parent_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(80);
      if (!replies.error) {
        for (const c of replies.data ?? []) {
          const uid = typeof c.user_id === "string" ? c.user_id : "";
          const tid =
            typeof c.track_id === "string" ? c.track_id.trim() : "";
          const cid = Number(c.id);
          if (!uid || !tid || !Number.isFinite(cid)) continue;
          const key = `${uid}:${tid}`;
          if (!replyCommentIdByKey.has(key)) {
            replyCommentIdByKey.set(key, cid);
          }
        }
      }
    }

    const playlistReplyIdByKey = new Map<string, number>();
    const needPr: { actor: string; playlist: string }[] = [];
    const seenPr = new Set<string>();
    for (const r of filtered) {
      if (String(r.kind) !== "playlist_comment_reply") continue;
      const actor =
        typeof r.actor_id === "string" && r.actor_id.trim()
          ? r.actor_id.trim()
          : "";
      const playlist =
        typeof r.playlist_id === "string" && r.playlist_id.trim()
          ? r.playlist_id.trim()
          : "";
      if (!actor || !playlist) continue;
      const key = `${actor}:${playlist}`;
      if (seenPr.has(key)) continue;
      seenPr.add(key);
      needPr.push({ actor, playlist });
    }
    if (needPr.length > 0) {
      const actors = [...new Set(needPr.map((n) => n.actor))];
      const playlists = [...new Set(needPr.map((n) => n.playlist))];
      const replies = await supabase
        .from("playlist_comments")
        .select("id, user_id, playlist_id, parent_id, created_at")
        .in("user_id", actors)
        .in("playlist_id", playlists)
        .not("parent_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(80);
      if (!replies.error) {
        for (const c of replies.data ?? []) {
          const uid = typeof c.user_id === "string" ? c.user_id : "";
          const pid =
            typeof c.playlist_id === "string"
              ? c.playlist_id.trim()
              : String(c.playlist_id ?? "");
          const cid = Number(c.id);
          if (!uid || !pid || !Number.isFinite(cid)) continue;
          const key = `${uid}:${pid}`;
          if (!playlistReplyIdByKey.has(key)) {
            playlistReplyIdByKey.set(key, cid);
          }
        }
      }
    }

    const notifications: ArtistNotification[] = filtered.map((r) => {
      const tipId =
        r.tip_id != null && Number.isFinite(Number(r.tip_id))
          ? Number(r.tip_id)
          : null;
      const trackId =
        (typeof r.track_id === "string" && r.track_id.trim()
          ? r.track_id.trim()
          : null) ||
        (tipId != null ? (trackIdByTipId.get(tipId) ?? null) : null);
      const playlistId =
        typeof r.playlist_id === "string" && r.playlist_id.trim()
          ? r.playlist_id.trim()
          : null;
      const relatedPlaylistId =
        typeof r.related_playlist_id === "string" &&
        r.related_playlist_id.trim()
          ? r.related_playlist_id.trim()
          : null;
      const actorId = (r.actor_id as string | null) ?? null;
      let playId =
        typeof r.play_id === "string" && r.play_id.trim()
          ? r.play_id.trim()
          : null;
      if (
        !playId &&
        String(r.kind) === "listen" &&
        actorId &&
        trackId
      ) {
        playId = playIdByKey.get(`${actorId}:${trackId}`) ?? null;
      }
      let commentId =
        r.comment_id != null && Number.isFinite(Number(r.comment_id))
          ? Number(r.comment_id)
          : null;
      if (
        commentId == null &&
        String(r.kind) === "comment" &&
        actorId &&
        trackId
      ) {
        commentId = commentIdByKey.get(`${actorId}:${trackId}`) ?? null;
      }
      if (
        commentId == null &&
        String(r.kind) === "comment_reply" &&
        actorId &&
        trackId
      ) {
        commentId = replyCommentIdByKey.get(`${actorId}:${trackId}`) ?? null;
      }
      let playlistCommentId =
        r.playlist_comment_id != null &&
        Number.isFinite(Number(r.playlist_comment_id))
          ? Number(r.playlist_comment_id)
          : null;
      if (
        playlistCommentId == null &&
        String(r.kind) === "playlist_comment" &&
        actorId &&
        playlistId
      ) {
        playlistCommentId =
          playlistCommentIdByKey.get(`${actorId}:${playlistId}`) ?? null;
      }
      if (
        String(r.kind) === "playlist_comment_reply" &&
        actorId &&
        playlistId
      ) {
        const replyId =
          playlistReplyIdByKey.get(`${actorId}:${playlistId}`) ?? null;
        // Prefer reply id — older notifs stored the parent comment id
        if (replyId != null) playlistCommentId = replyId;
      }
      return {
        id: Number(r.id),
        kind: String(r.kind),
        amount_xof:
          r.amount_xof != null ? Number(r.amount_xof) || null : null,
        body: (r.body as string | null) ?? null,
        track_id: trackId,
        track_title: trackId ? (titleByTrackId.get(trackId) ?? null) : null,
        playlist_id: playlistId,
        playlist_name: playlistId
          ? (nameByPlaylistId.get(playlistId) ?? null)
          : null,
        related_playlist_id: relatedPlaylistId,
        tip_id: tipId,
        tip_thanks_message:
          tipId != null ? (thanksByTipId.get(tipId) ?? null) : null,
        share_thanks_message:
          typeof r.thanks_message === "string" && r.thanks_message.trim()
            ? r.thanks_message.trim()
            : null,
        play_id: playId,
        comment_id: commentId,
        playlist_comment_id: playlistCommentId,
        actor_id: actorId,
        actor_name: actorId
          ? (nameById.get(actorId) ?? "Someone")
          : "Someone",
        read_at: (r.read_at as string | null) ?? null,
        created_at: (r.created_at as string | null) ?? null,
      };
    });

    return {
      notifications,
      unreadCount: notifications.filter((n) => !n.read_at).length,
      missingTable: false,
      error: null,
    };
  } catch (e) {
    return {
      notifications: [],
      unreadCount: 0,
      missingTable: false,
      error: e instanceof Error ? e.message : "Failed to map inbox",
    };
  }
}

export async function markNotificationsRead(
  supabase: SupabaseClient,
  ids?: number[],
): Promise<
  | { ok: true; marked: number }
  | { ok: false; error: string; code?: "missing_table" | "failed" }
> {
  const { data, error } = await supabase.rpc(
    "mark_artist_notifications_read",
    {
      p_ids: ids && ids.length > 0 ? ids : null,
    },
  );

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run artist notifications SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as { marked?: number } | null;
  return { ok: true, marked: Number(row?.marked) || 0 };
}

export function formatNotificationTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
