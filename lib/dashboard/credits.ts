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

export type PurchaseResult =
  | {
      ok: true;
      purchase_id: number | null;
      credits_granted: number;
      balance: number;
      pack_code: string | null;
      pack_name: string | null;
    }
  | {
      ok: false;
      error: string;
      code?: "not_authenticated" | "pack_not_found" | "missing_table" | "failed";
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
  return {
    ok: true,
    purchase_id: row?.purchase_id != null ? Number(row.purchase_id) : null,
    credits_granted: Number(row?.credits_granted) || 0,
    balance: Number(row?.balance) || 0,
    pack_code: typeof row?.pack_code === "string" ? row.pack_code : null,
    pack_name: typeof row?.pack_name === "string" ? row.pack_name : null,
  };
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
      return {
        ok: false,
        error:
          "Run 20260811_record_credited_play.sql in Supabase (record_credited_play).",
        code: "missing_table",
      };
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
