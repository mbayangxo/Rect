import type { SupabaseClient } from "@supabase/supabase-js";

export const TIP_AMOUNTS_XOF = [100, 200, 500] as const;
export type TipAmountXof = (typeof TIP_AMOUNTS_XOF)[number];

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type TipResult =
  | {
      ok: true;
      tip_id: number | null;
      artist_id: string;
      amount_xof: number;
      payment_method: string;
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

export async function sendArtistTip(
  supabase: SupabaseClient,
  artistId: string,
  amountXof: number,
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

  const { data, error } = await supabase.rpc("send_artist_tip", {
    p_artist_id: id,
    p_amount_xof: amountXof,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return sendArtistTipFallback(supabase, id, amountXof);
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
  };
}

async function sendArtistTipFallback(
  supabase: SupabaseClient,
  artistId: string,
  amountXof: number,
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

  const { data, error } = await supabase
    .from("artist_tips")
    .insert({
      from_user_id: user.id,
      artist_id: artistId,
      amount_xof: amountXof,
      status: "confirmed",
      payment_method: "stub",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run artist tips SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  return {
    ok: true,
    tip_id: data?.id != null ? Number(data.id) : null,
    artist_id: artistId,
    amount_xof: amountXof,
    payment_method: "stub",
  };
}

export type ArtistTipStats = {
  totalXof: number;
  tipCount: number;
  thisMonthXof: number;
  recent: { id: number; amount_xof: number; created_at: string | null }[];
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

export async function loadArtistTipStats(
  supabase: SupabaseClient,
  artistId: string,
): Promise<ArtistTipStats> {
  const empty: ArtistTipStats = {
    totalXof: 0,
    tipCount: 0,
    thisMonthXof: 0,
    recent: [],
    missingTable: false,
    error: null,
  };

  try {
    const { data, error } = await supabase
      .from("artist_tips")
      .select("id, amount_xof, created_at, status")
      .eq("artist_id", artistId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(200);

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

    for (const r of rows) {
      const amt = Number(r.amount_xof) || 0;
      totalXof += amt;
      const at = r.created_at as string | null;
      if (at && at >= monthStart) thisMonthXof += amt;
    }

    return {
      totalXof,
      tipCount: rows.length,
      thisMonthXof,
      recent: rows.slice(0, 8).map((r) => ({
        id: Number(r.id),
        amount_xof: Number(r.amount_xof) || 0,
        created_at: (r.created_at as string | null) ?? null,
      })),
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
    const { data, error } = await supabase
      .from("artist_tips")
      .select("id, artist_id, amount_xof, created_at, payment_method, status")
      .eq("from_user_id", userId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(limit);

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

    let totalXof = 0;
    const tips: MyTip[] = rows.map((r) => {
      const amt = Number(r.amount_xof) || 0;
      totalXof += amt;
      const artistId = r.artist_id as string;
      return {
        id: Number(r.id),
        artist_id: artistId,
        artist_name: nameById.get(artistId) ?? "Artist",
        amount_xof: amt,
        created_at: (r.created_at as string | null) ?? null,
        payment_method:
          typeof r.payment_method === "string" ? r.payment_method : "stub",
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
