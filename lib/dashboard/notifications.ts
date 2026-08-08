import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type ArtistNotification = {
  id: number;
  kind: "follow" | "tip" | "release" | string;
  amount_xof: number | null;
  body: string | null;
  track_id: string | null;
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
  opts?: { amount_xof?: number; body?: string },
): Promise<{ ok: boolean; missingTable?: boolean }> {
  const { error } = await supabase.rpc("notify_artist", {
    p_recipient_id: recipientId,
    p_kind: kind,
    p_amount_xof: opts?.amount_xof ?? null,
    p_body: opts?.body ?? null,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, missingTable: true };
    }
    // Soft-fail — tip/follow already succeeded
    return { ok: false };
  }
  return { ok: true };
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

export async function loadArtistNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 40,
): Promise<NotificationsLoadResult> {
  try {
    const { data, error } = await supabase
      .from("artist_notifications")
      .select(
        "id, kind, amount_xof, body, track_id, actor_id, read_at, created_at",
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
      // Older schema without track_id
      if (/track_id|column .* does not exist/i.test(error.message)) {
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
        return mapNotificationRows(supabase, lean.data ?? []);
      }
      return {
        notifications: [],
        unreadCount: 0,
        missingTable: false,
        error: error.message,
      };
    }

    return mapNotificationRows(supabase, data ?? []);
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
): Promise<NotificationsLoadResult> {
  try {
    const actorIds = [
      ...new Set(
        rows
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

    const notifications: ArtistNotification[] = rows.map((r) => ({
      id: Number(r.id),
      kind: String(r.kind),
      amount_xof:
        r.amount_xof != null ? Number(r.amount_xof) || null : null,
      body: (r.body as string | null) ?? null,
      track_id: (r.track_id as string | null) ?? null,
      actor_id: (r.actor_id as string | null) ?? null,
      actor_name: r.actor_id
        ? (nameById.get(r.actor_id as string) ?? "Someone")
        : "Someone",
      read_at: (r.read_at as string | null) ?? null,
      created_at: (r.created_at as string | null) ?? null,
    }));

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
