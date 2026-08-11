import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export const TIP_AMOUNTS_XOF = [100, 200, 500] as const;
export type TipAmountXof = (typeof TIP_AMOUNTS_XOF)[number];

export const TIP_MESSAGE_MAX = 280;
export const TIP_THANKS_MAX = 280;

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

function isMissingColumn(message: string) {
  return /column .* does not exist|PGRST204/i.test(message);
}

function normalizeTipMessage(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  return trimmed.length > TIP_MESSAGE_MAX
    ? trimmed.slice(0, TIP_MESSAGE_MAX)
    : trimmed;
}

function normalizeTrackId(raw: string | null | undefined): string | null {
  const id = typeof raw === "string" ? raw.trim() : "";
  return id || null;
}

export type TipResult =
  | {
      ok: true;
      tip_id: number | null;
      artist_id: string;
      amount_xof: number;
      payment_method: string;
      message: string | null;
      track_id: string | null;
    }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "missing_table"
        | "cannot_tip_self"
        | "invalid_amount"
        | "artist_not_found"
        | "failed";
    };

export type SendTipOpts = {
  message?: string | null;
  trackId?: string | null;
};

export async function sendArtistTip(
  supabase: SupabaseClient,
  artistId: string,
  amountXof: number,
  opts?: SendTipOpts,
): Promise<TipResult> {
  const id = artistId.trim();
  if (!id) {
    return { ok: false, error: "artist_id is required", code: "failed" };
  }
  if (!(TIP_AMOUNTS_XOF as readonly number[]).includes(amountXof)) {
    return {
      ok: false,
      error: "Choose 100, 200, or 500 XOF",
      code: "invalid_amount",
    };
  }

  const message = normalizeTipMessage(opts?.message);
  const trackId = normalizeTrackId(opts?.trackId);

  let { data, error } = await supabase.rpc("send_artist_tip", {
    p_artist_id: id,
    p_amount_xof: amountXof,
    p_message: message,
    p_track_id: trackId,
  });

  if (
    error &&
    /p_message|p_track_id|Could not find the function|PGRST202/i.test(
      error.message,
    )
  ) {
    const retry = await supabase.rpc("send_artist_tip", {
      p_artist_id: id,
      p_amount_xof: amountXof,
    });
    data = retry.data;
    error = retry.error;
    if (!error) {
      // Old RPC succeeded without note — try to persist note via fallback update
      const tipId =
        (data as Record<string, unknown> | null)?.tip_id != null
          ? Number((data as Record<string, unknown>).tip_id)
          : null;
      if (tipId != null && (message || trackId)) {
        await supabase
          .from("artist_tips")
          .update({
            ...(message ? { message } : {}),
            ...(trackId ? { track_id: trackId } : {}),
          })
          .eq("id", tipId);
      }
    }
  }

  if (error) {
    if (isMissingRelation(error.message)) {
      return sendArtistTipFallback(supabase, id, amountXof, message, trackId);
    }
    if (/not_authenticated/i.test(error.message)) {
      return {
        ok: false,
        error: "Sign in required",
        code: "not_authenticated",
      };
    }
    if (/cannot_tip_self/i.test(error.message)) {
      return {
        ok: false,
        error: "You can’t tip yourself",
        code: "cannot_tip_self",
      };
    }
    if (/invalid_amount/i.test(error.message)) {
      return {
        ok: false,
        error: "Choose 100, 200, or 500 XOF",
        code: "invalid_amount",
      };
    }
    if (/artist_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Artist not found",
        code: "artist_not_found",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as Record<string, unknown> | null;
  return {
    ok: true,
    tip_id: row?.tip_id != null ? Number(row.tip_id) : null,
    artist_id: typeof row?.artist_id === "string" ? row.artist_id : id,
    amount_xof:
      typeof row?.amount_xof === "number" ? row.amount_xof : amountXof,
    payment_method:
      typeof row?.payment_method === "string" ? row.payment_method : "stub",
    message:
      typeof row?.message === "string" && row.message.trim()
        ? row.message.trim()
        : message,
    track_id:
      typeof row?.track_id === "string" && row.track_id.trim()
        ? row.track_id.trim()
        : trackId,
  };
}

async function sendArtistTipFallback(
  supabase: SupabaseClient,
  artistId: string,
  amountXof: number,
  message: string | null,
  trackId: string | null,
): Promise<TipResult> {
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
  if (user.id === artistId) {
    return {
      ok: false,
      error: "You can’t tip yourself",
      code: "cannot_tip_self",
    };
  }

  const { data: artist, error: artistError } = await supabase
    .from("users")
    .select("id, account_type, role")
    .eq("id", artistId)
    .maybeSingle();

  if (artistError) {
    if (isMissingRelation(artistError.message)) {
      return {
        ok: false,
        error: "Run artist tips SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: artistError.message, code: "failed" };
  }

  const isArtist =
    artist?.account_type === "artist" || artist?.role === "artist";
  if (!artist || !isArtist) {
    return {
      ok: false,
      error: "Artist not found",
      code: "artist_not_found",
    };
  }

  let resolvedTrack: string | null = trackId;
  if (resolvedTrack) {
    const { data: track } = await supabase
      .from("tracks")
      .select("id, artist_id")
      .eq("id", resolvedTrack)
      .maybeSingle();
    if (
      !track ||
      String((track as { artist_id?: string }).artist_id ?? "") !== artistId
    ) {
      resolvedTrack = null;
    }
  }

  const baseRow = {
    from_user_id: user.id,
    artist_id: artistId,
    amount_xof: amountXof,
    status: "confirmed",
    payment_method: "stub",
  };

  let insert = await supabase
    .from("artist_tips")
    .insert({
      ...baseRow,
      message,
      track_id: resolvedTrack,
    })
    .select("id")
    .maybeSingle();

  if (insert.error && isMissingColumn(insert.error.message)) {
    insert = await supabase
      .from("artist_tips")
      .insert(baseRow)
      .select("id")
      .maybeSingle();
  }

  if (insert.error) {
    if (isMissingRelation(insert.error.message)) {
      return {
        ok: false,
        error: "Run artist tips SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: insert.error.message, code: "failed" };
  }

  return {
    ok: true,
    tip_id: insert.data?.id != null ? Number(insert.data.id) : null,
    artist_id: artistId,
    amount_xof: amountXof,
    payment_method: "stub",
    message,
    track_id: resolvedTrack,
  };
}

export type ArtistTipLedgerEntry = {
  id: number;
  from_user_id: string | null;
  tipper_name: string;
  amount_xof: number;
  created_at: string | null;
  payment_method: string;
  message: string | null;
  track_id: string | null;
  track_title: string | null;
  thanks_message: string | null;
  thanks_at: string | null;
};

export type ArtistTipStats = {
  totalXof: number;
  tipCount: number;
  thisMonthXof: number;
  uniqueTippers: number;
  recent: ArtistTipLedgerEntry[];
  missingTable: boolean;
  error: string | null;
};

function startOfMonthIso() {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
  ).toISOString();
}

export async function tipsTableReady(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { error } = await supabase
    .from("artist_tips")
    .select("id")
    .limit(1);
  if (!error) return true;
  return !isMissingRelation(error.message);
}

async function loadTrackTitles(
  supabase: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (trackIds.length === 0) return map;
  const { data } = await supabase
    .from("tracks")
    .select("id, title")
    .in("id", trackIds);
  for (const t of data ?? []) {
    const id = t.id as string;
    const title =
      typeof t.title === "string" && t.title.trim() ? t.title.trim() : "Track";
    map.set(id, title);
  }
  return map;
}

export async function loadArtistTipStats(
  supabase: SupabaseClient,
  artistId: string,
): Promise<ArtistTipStats> {
  const empty: ArtistTipStats = {
    totalXof: 0,
    tipCount: 0,
    thisMonthXof: 0,
    uniqueTippers: 0,
    recent: [],
    missingTable: false,
    error: null,
  };

  try {
    let { data, error } = await supabase
      .from("artist_tips")
      .select(
        "id, from_user_id, amount_xof, created_at, status, payment_method, message, track_id, thanks_message, thanks_at",
      )
      .eq("artist_id", artistId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error && isMissingColumn(error.message)) {
      const mid = await supabase
        .from("artist_tips")
        .select(
          "id, from_user_id, amount_xof, created_at, status, payment_method, message, track_id",
        )
        .eq("artist_id", artistId)
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!mid.error) {
        data = mid.data as typeof data;
        error = null;
      } else if (isMissingColumn(mid.error.message)) {
        const lean = await supabase
          .from("artist_tips")
          .select(
            "id, from_user_id, amount_xof, created_at, status, payment_method",
          )
          .eq("artist_id", artistId)
          .eq("status", "confirmed")
          .order("created_at", { ascending: false })
          .limit(200);
        data = lean.data as typeof data;
        error = lean.error;
      } else {
        data = mid.data as typeof data;
        error = mid.error;
      }
    }

    if (error) {
      if (isMissingRelation(error.message)) {
        return { ...empty, missingTable: true };
      }
      return { ...empty, error: error.message };
    }

    const rows = data ?? [];
    const monthStart = startOfMonthIso();
    let totalXof = 0;
    let thisMonthXof = 0;
    const tipperIds = new Set<string>();
    const trackIds = new Set<string>();

    for (const r of rows) {
      const amt = Number(r.amount_xof) || 0;
      totalXof += amt;
      const at = r.created_at as string | null;
      if (at && at >= monthStart) thisMonthXof += amt;
      const fromId = r.from_user_id as string | null;
      if (fromId) tipperIds.add(fromId);
      const tid =
        typeof (r as { track_id?: string | null }).track_id === "string"
          ? (r as { track_id: string }).track_id.trim()
          : "";
      if (tid) trackIds.add(tid);
    }

    const nameById = new Map<string, string>();
    if (tipperIds.size > 0) {
      // Admin read: tippers are often listeners (not public artists), so RLS
      // would hide display_name from the tipped artist otherwise.
      const admin = createAdminClient();
      const db = admin ?? supabase;
      const { data: tippers } = await db
        .from("users")
        .select("id, display_name")
        .in("id", [...tipperIds]);
      for (const u of tippers ?? []) {
        const name =
          typeof u.display_name === "string" && u.display_name.trim()
            ? u.display_name.trim()
            : "Listener";
        nameById.set(u.id as string, name);
      }
    }

    const titleById = await loadTrackTitles(supabase, [...trackIds]);

    return {
      totalXof,
      tipCount: rows.length,
      thisMonthXof,
      uniqueTippers: tipperIds.size,
      recent: rows.slice(0, 12).map((r) => {
        const fromId = (r.from_user_id as string | null) ?? null;
        const trackId =
          typeof (r as { track_id?: string | null }).track_id === "string" &&
          (r as { track_id: string }).track_id.trim()
            ? (r as { track_id: string }).track_id.trim()
            : null;
        const message =
          typeof (r as { message?: string | null }).message === "string" &&
          (r as { message: string }).message.trim()
            ? (r as { message: string }).message.trim()
            : null;
        const thanksMessage =
          typeof (r as { thanks_message?: string | null }).thanks_message ===
            "string" &&
          (r as { thanks_message: string }).thanks_message.trim()
            ? (r as { thanks_message: string }).thanks_message.trim()
            : null;
        return {
          id: Number(r.id),
          from_user_id: fromId,
          tipper_name: fromId
            ? (nameById.get(fromId) ?? "Listener")
            : "Listener",
          amount_xof: Number(r.amount_xof) || 0,
          created_at: (r.created_at as string | null) ?? null,
          payment_method:
            typeof r.payment_method === "string" ? r.payment_method : "stub",
          message,
          track_id: trackId,
          track_title: trackId ? (titleById.get(trackId) ?? "Track") : null,
          thanks_message: thanksMessage,
          thanks_at:
            typeof (r as { thanks_at?: string | null }).thanks_at === "string"
              ? (r as { thanks_at: string }).thanks_at
              : null,
        };
      }),
      missingTable: false,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load tips";
    return {
      ...empty,
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

export type MyTip = {
  id: number;
  artist_id: string;
  artist_name: string;
  amount_xof: number;
  created_at: string | null;
  payment_method: string;
  message: string | null;
  track_id: string | null;
  track_title: string | null;
  thanks_message: string | null;
  thanks_at: string | null;
};

export type MyTipsResult = {
  tips: MyTip[];
  totalXof: number;
  missingTable: boolean;
  error: string | null;
};

/**
 * Tips the signed-in fan has sent.
 */
export async function loadMyTips(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
): Promise<MyTipsResult> {
  try {
    let { data, error } = await supabase
      .from("artist_tips")
      .select(
        "id, artist_id, amount_xof, created_at, payment_method, status, message, track_id, thanks_message, thanks_at",
      )
      .eq("from_user_id", userId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error && isMissingColumn(error.message)) {
      const mid = await supabase
        .from("artist_tips")
        .select(
          "id, artist_id, amount_xof, created_at, payment_method, status, message, track_id",
        )
        .eq("from_user_id", userId)
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!mid.error) {
        data = mid.data as typeof data;
        error = null;
      } else if (isMissingColumn(mid.error.message)) {
        const lean = await supabase
          .from("artist_tips")
          .select(
            "id, artist_id, amount_xof, created_at, payment_method, status",
          )
          .eq("from_user_id", userId)
          .eq("status", "confirmed")
          .order("created_at", { ascending: false })
          .limit(limit);
        data = lean.data as typeof data;
        error = lean.error;
      } else {
        data = mid.data as typeof data;
        error = mid.error;
      }
    }

    if (error) {
      if (isMissingRelation(error.message)) {
        return { tips: [], totalXof: 0, missingTable: true, error: null };
      }
      return {
        tips: [],
        totalXof: 0,
        missingTable: false,
        error: error.message,
      };
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return { tips: [], totalXof: 0, missingTable: false, error: null };
    }

    const artistIds = [
      ...new Set(
        rows.map((r) => r.artist_id as string).filter(Boolean),
      ),
    ];

    const { data: artists } = await supabase
      .from("users")
      .select("id, display_name, privacy_public_profile")
      .in("id", artistIds);

    const nameById = new Map<string, string>();
    for (const a of artists ?? []) {
      const publicOk =
        (a as { privacy_public_profile?: boolean | null })
          .privacy_public_profile !== false;
      const name =
        publicOk &&
        typeof a.display_name === "string" &&
        a.display_name.trim()
          ? a.display_name.trim()
          : "Private artist";
      nameById.set(a.id as string, name);
    }

    const trackIds = [
      ...new Set(
        rows
          .map((r) =>
            typeof (r as { track_id?: string | null }).track_id === "string"
              ? (r as { track_id: string }).track_id.trim()
              : "",
          )
          .filter(Boolean),
      ),
    ];
    const titleById = await loadTrackTitles(supabase, trackIds);

    let totalXof = 0;
    const tips: MyTip[] = rows.map((r) => {
      const amt = Number(r.amount_xof) || 0;
      totalXof += amt;
      const artistId = r.artist_id as string;
      const trackId =
        typeof (r as { track_id?: string | null }).track_id === "string" &&
        (r as { track_id: string }).track_id.trim()
          ? (r as { track_id: string }).track_id.trim()
          : null;
      const message =
        typeof (r as { message?: string | null }).message === "string" &&
        (r as { message: string }).message.trim()
          ? (r as { message: string }).message.trim()
          : null;
      const thanksMessage =
        typeof (r as { thanks_message?: string | null }).thanks_message ===
          "string" &&
        (r as { thanks_message: string }).thanks_message.trim()
          ? (r as { thanks_message: string }).thanks_message.trim()
          : null;
      return {
        id: Number(r.id),
        artist_id: artistId,
        artist_name: nameById.get(artistId) ?? "Artist",
        amount_xof: amt,
        created_at: (r.created_at as string | null) ?? null,
        payment_method:
          typeof r.payment_method === "string" ? r.payment_method : "stub",
        message,
        track_id: trackId,
        track_title: trackId ? (titleById.get(trackId) ?? "Track") : null,
        thanks_message: thanksMessage,
        thanks_at:
          typeof (r as { thanks_at?: string | null }).thanks_at === "string"
            ? (r as { thanks_at: string }).thanks_at
            : null,
      };
    });

    return { tips, totalXof, missingTable: false, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load tips";
    return {
      tips: [],
      totalXof: 0,
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

export type SendTipThanksResult =
  | {
      ok: true;
      tip_id: number;
      thanks_message: string;
      skipped?: string;
    }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "tip_not_found"
        | "not_tip_owner"
        | "already_thanked"
        | "message_required"
        | "missing_table"
        | "failed";
    };

export async function sendTipThanks(
  supabase: SupabaseClient,
  tipId: number,
  messageRaw: string,
): Promise<SendTipThanksResult> {
  const message = normalizeTipMessage(messageRaw);
  if (!message) {
    return {
      ok: false,
      error: "Write a short thank-you",
      code: "message_required",
    };
  }

  const { data, error } = await supabase.rpc("send_tip_thanks", {
    p_tip_id: tipId,
    p_message: message,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run tip thanks SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/not_authenticated/i.test(error.message)) {
      return {
        ok: false,
        error: "Sign in required",
        code: "not_authenticated",
      };
    }
    if (/tip_not_found/i.test(error.message)) {
      return { ok: false, error: "Tip not found", code: "tip_not_found" };
    }
    if (/not_tip_owner/i.test(error.message)) {
      return {
        ok: false,
        error: "Only the tipped artist can thank",
        code: "not_tip_owner",
      };
    }
    if (/already_thanked/i.test(error.message)) {
      return {
        ok: false,
        error: "Already thanked this tip",
        code: "already_thanked",
      };
    }
    if (/message_required/i.test(error.message)) {
      return {
        ok: false,
        error: "Write a short thank-you",
        code: "message_required",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as Record<string, unknown> | null;
  return {
    ok: true,
    tip_id: Number(row?.tip_id ?? tipId),
    thanks_message:
      typeof row?.thanks_message === "string" && row.thanks_message.trim()
        ? row.thanks_message.trim()
        : message,
    skipped:
      typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}
