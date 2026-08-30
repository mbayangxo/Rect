import type { SupabaseClient } from "@supabase/supabase-js";

export type CreditBalance = {
  credits: number;
  missingTable: boolean;
};

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

/**
 * Load (or soft-create) listener play credit balance.
 * Starter credits come from ensure_play_balance when SQL is applied.
 */
export async function loadPlayCreditBalance(
  supabase: SupabaseClient,
): Promise<CreditBalance> {
  try {
    const { data, error } = await supabase.rpc("ensure_play_balance", {
      p_starter: 25,
    });

    if (error) {
      if (isMissingRelation(error.message)) {
        return { credits: 0, missingTable: true };
      }
      // Fallback: read row without RPC
      const { data: row, error: readError } = await supabase
        .from("user_play_balances")
        .select("credits")
        .maybeSingle();
      if (readError) {
        if (isMissingRelation(readError.message)) {
          return { credits: 0, missingTable: true };
        }
        return { credits: 0, missingTable: false };
      }
      return {
        credits: Number(row?.credits) || 0,
        missingTable: false,
      };
    }

    return { credits: Number(data) || 0, missingTable: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { credits: 0, missingTable: isMissingRelation(msg) };
  }
}

export type PendingPackPurchase = {
  id: number;
  pack_id: number;
  credits_pending: number;
  pack_code: string | null;
  pack_name: string | null;
  price_label: string | null;
  created_at: string | null;
};

export async function loadPendingPackPurchases(
  supabase: SupabaseClient,
): Promise<{ purchases: PendingPackPurchase[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("play_pack_purchases")
      .select("id, pack_id, credits_granted, created_at, status")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { purchases: [], error: null };
      }
      return { purchases: [], error: error.message };
    }

    const rows = data ?? [];
    if (rows.length === 0) return { purchases: [], error: null };

    const packIds = [
      ...new Set(rows.map((r) => Number(r.pack_id)).filter(Number.isFinite)),
    ];
    const { data: packs } = await supabase
      .from("play_packs")
      .select("id, code, name, price_label")
      .in("id", packIds);
    const byId = new Map(
      (packs ?? []).map((p) => [Number(p.id), p] as const),
    );

    const purchases: PendingPackPurchase[] = rows.map((r) => {
      const pack = byId.get(Number(r.pack_id));
      return {
        id: Number(r.id),
        pack_id: Number(r.pack_id),
        credits_pending: Number(r.credits_granted) || 0,
        pack_code: typeof pack?.code === "string" ? pack.code : null,
        pack_name: typeof pack?.name === "string" ? pack.name : null,
        price_label:
          typeof pack?.price_label === "string" ? pack.price_label : null,
        created_at: typeof r.created_at === "string" ? r.created_at : null,
      };
    });

    return { purchases, error: null };
  } catch (e) {
    return {
      purchases: [],
      error: e instanceof Error ? e.message : "Failed to load pending packs",
    };
  }
}

export type PurchaseResult =
  | {
      ok: true;
      status: "pending" | "confirmed";
      purchase_id: number | null;
      credits_granted: number;
      credits_pending: number;
      balance: number | null;
      pack_code: string | null;
      pack_name: string | null;
      price_label?: string | null;
    }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "pack_not_found"
        | "purchase_not_found"
        | "missing_table"
        | "failed";
    };

export async function purchasePlayPack(
  supabase: SupabaseClient,
  packId: string,
): Promise<PurchaseResult> {
  const idNum = Number(packId);
  if (!Number.isFinite(idNum)) {
    return { ok: false, error: "Invalid pack", code: "pack_not_found" };
  }

  const { data, error } = await supabase.rpc("purchase_play_pack", {
    p_pack_id: idNum,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run play credits SQL in Supabase (purchase_play_pack).",
        code: "missing_table",
      };
    }
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    if (/pack_not_found/i.test(error.message)) {
      return { ok: false, error: "Pack not found", code: "pack_not_found" };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as Record<string, unknown> | null;
  const status =
    row?.status === "confirmed" ? ("confirmed" as const) : ("pending" as const);
  return {
    ok: true,
    status,
    purchase_id: row?.purchase_id != null ? Number(row.purchase_id) : null,
    credits_granted: Number(row?.credits_granted) || 0,
    credits_pending: Number(row?.credits_pending) || 0,
    balance: row?.balance == null ? null : Number(row.balance),
    pack_code: typeof row?.pack_code === "string" ? row.pack_code : null,
    pack_name: typeof row?.pack_name === "string" ? row.pack_name : null,
    price_label: typeof row?.price_label === "string" ? row.price_label : null,
  };
}

export async function confirmPlayPackPurchase(
  supabase: SupabaseClient,
  purchaseId: string | number,
): Promise<PurchaseResult> {
  const idNum = Number(purchaseId);
  if (!Number.isFinite(idNum)) {
    return { ok: false, error: "Invalid purchase", code: "purchase_not_found" };
  }

  const { data, error } = await supabase.rpc("confirm_play_pack_purchase", {
    p_purchase_id: idNum,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error:
          "Run 20260811_play_pack_purchase_pending.sql in Supabase (confirm_play_pack_purchase).",
        code: "missing_table",
      };
    }
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    if (/purchase_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Purchase not found",
        code: "purchase_not_found",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as Record<string, unknown> | null;
  return {
    ok: true,
    status: "confirmed",
    purchase_id: row?.purchase_id != null ? Number(row.purchase_id) : idNum,
    credits_granted: Number(row?.credits_granted) || 0,
    credits_pending: 0,
    balance: row?.balance == null ? null : Number(row.balance),
    pack_code: typeof row?.pack_code === "string" ? row.pack_code : null,
    pack_name: typeof row?.pack_name === "string" ? row.pack_name : null,
  };
}

export async function cancelPlayPackPurchase(
  supabase: SupabaseClient,
  purchaseId: string | number,
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const idNum = Number(purchaseId);
  if (!Number.isFinite(idNum)) {
    return { ok: false, error: "Invalid purchase", code: "purchase_not_found" };
  }

  const { error } = await supabase.rpc("cancel_play_pack_purchase", {
    p_purchase_id: idNum,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run 20260811_play_pack_purchase_pending.sql in Supabase.",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  return { ok: true };
}

export type ConsumeResult =
  | { ok: true; balance: number; skipped: false }
  | {
      ok: false;
      error: string;
      code: "insufficient" | "failed" | "missing_table";
    };

export type CreditedPlayResult =
  | {
      ok: true;
      play_id: string | null;
      balance: number;
    }
  | {
      ok: false;
      error: string;
      code:
        | "insufficient"
        | "track_not_found"
        | "not_authenticated"
        | "failed"
        | "missing_table";
    };

/** Decrement one credit. Hard-fails if ledger RPCs are not migrated. */
export async function consumePlayCredit(
  supabase: SupabaseClient,
): Promise<ConsumeResult> {
  const { data, error } = await supabase.rpc("consume_play_credit");

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run play credits SQL in Supabase (consume_play_credit).",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const bal = Number(data);
  if (bal < 0) {
    return {
      ok: false,
      error: "No play credits left. Buy a play pack to keep listening.",
      code: "insufficient",
    };
  }

  return { ok: true, balance: bal, skipped: false };
}

/**
 * Consume one credit and insert the play in a single DB transaction.
 * Prefer this over consumePlayCredit + manual plays insert.
 */
async function recordCreditedPlayFallback(
  supabase: SupabaseClient,
  trackId: string,
  starter: number,
): Promise<CreditedPlayResult> {
  await supabase.rpc("ensure_play_balance", { p_starter: starter });

  const consumed = await consumePlayCredit(supabase);
  if (!consumed.ok) {
    return {
      ok: false,
      error: consumed.error,
      code:
        consumed.code === "insufficient"
          ? "insufficient"
          : consumed.code === "missing_table"
            ? "missing_table"
            : "failed",
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      error: "Sign in required to record plays.",
      code: "not_authenticated",
    };
  }

  const { data: play, error: playError } = await supabase
    .from("plays")
    .insert({ track_id: trackId, listener_id: user.id })
    .select("id")
    .maybeSingle();

  if (playError || !play?.id) {
    return {
      ok: false,
      error: playError?.message || "Play not recorded",
      code: "failed",
    };
  }

  return {
    ok: true,
    play_id: String(play.id),
    balance: consumed.balance,
  };
}

export async function recordCreditedPlay(
  supabase: SupabaseClient,
  trackId: string,
  starter = 25,
): Promise<CreditedPlayResult> {
  const id = trackId.trim();
  if (!id) {
    return { ok: false, error: "Track not found", code: "track_not_found" };
  }

  const { data, error } = await supabase.rpc("record_credited_play", {
    p_track_id: id,
    p_starter: starter,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return recordCreditedPlayFallback(supabase, id, starter);
    }
    if (/not_authenticated/i.test(error.message)) {
      return {
        ok: false,
        error: "Sign in required to record plays.",
        code: "not_authenticated",
      };
    }
    if (/track_not_found|track_required/i.test(error.message)) {
      return { ok: false, error: "Track not found", code: "track_not_found" };
    }
    if (/insufficient_credits/i.test(error.message)) {
      return {
        ok: false,
        error: "No play credits left. Buy a play pack to keep listening.",
        code: "insufficient",
      };
    }
    // Atomic RPC broken (e.g. play_id uuid/bigint drift) — two-step fallback.
    if (/invalid input syntax for type bigint|invalid input syntax for type uuid/i.test(error.message)) {
      return recordCreditedPlayFallback(supabase, id, starter);
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as Record<string, unknown> | null;
  const balance = Number(row?.credits_remaining);
  return {
    ok: true,
    play_id: row?.play_id != null ? String(row.play_id) : null,
    balance: Number.isFinite(balance) ? balance : 0,
  };
}
