import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

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
      // App-level fallback when RPC not migrated yet
      return purchasePlayPackFallback(supabase, idNum);
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

async function purchasePlayPackFallback(
  supabase: SupabaseClient,
  packId: number,
): Promise<PurchaseResult> {
  const admin = createAdminClient();
  const db = admin ?? supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required", code: "not_authenticated" };
  }

  const { data: pack, error: packError } = await db
    .from("play_packs")
    .select("id, code, name, play_credits, play_count, price_xof, active")
    .eq("id", packId)
    .maybeSingle();

  if (packError) {
    if (isMissingRelation(packError.message)) {
      return {
        ok: false,
        error: "Run play credits SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: packError.message, code: "failed" };
  }
  if (!pack || pack.active === false) {
    return { ok: false, error: "Pack not found", code: "pack_not_found" };
  }

  const credits =
    Number(pack.play_credits) || Number(pack.play_count) || 0;
  if (credits <= 0) {
    return { ok: false, error: "Pack has no credits", code: "failed" };
  }

  const { data: purchase, error: purchaseError } = await db
    .from("play_pack_purchases")
    .insert({
      user_id: user.id,
      pack_id: packId,
      credits_granted: credits,
      price_xof: pack.price_xof ?? null,
      status: "confirmed",
      payment_method: "stub",
    })
    .select("id")
    .maybeSingle();

  if (purchaseError) {
    if (isMissingRelation(purchaseError.message)) {
      return {
        ok: false,
        error: "Run play credits SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: purchaseError.message, code: "failed" };
  }

  const { data: existing } = await db
    .from("user_play_balances")
    .select("credits")
    .eq("user_id", user.id)
    .maybeSingle();

  const next = (Number(existing?.credits) || 0) + credits;
  const { error: balError } = await db.from("user_play_balances").upsert({
    user_id: user.id,
    credits: next,
    updated_at: new Date().toISOString(),
  });

  if (balError) {
    return { ok: false, error: balError.message, code: "failed" };
  }

  return {
    ok: true,
    purchase_id: purchase?.id != null ? Number(purchase.id) : null,
    credits_granted: credits,
    balance: next,
    pack_code: typeof pack.code === "string" ? pack.code : null,
    pack_name: typeof pack.name === "string" ? pack.name : null,
  };
}

export type ConsumeResult =
  | { ok: true; balance: number; skipped: false }
  | { ok: true; balance: null; skipped: true; reason: "missing_table" }
  | { ok: false; error: string; code: "insufficient" | "failed" };

/** Decrement one credit. Soft-skips if ledger tables not migrated yet. */
export async function consumePlayCredit(
  supabase: SupabaseClient,
): Promise<ConsumeResult> {
  const { data, error } = await supabase.rpc("consume_play_credit");

  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: true, balance: null, skipped: true, reason: "missing_table" };
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
