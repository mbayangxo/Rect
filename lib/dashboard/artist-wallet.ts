import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type WalletLedgerRow = {
  id: number;
  kind: string;
  amountXof: number;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
};

export type WalletPayoutRow = {
  id: number;
  amountXof: number;
  status: string;
  payoutPhone: string;
  scheduledFor: string | null;
  paidAt: string | null;
  jokoReference: string | null;
  createdAt: string;
};

export type ArtistWalletSummary = {
  ready: boolean;
  balanceXof: number;
  streamsXof: number;
  downloadsXof: number;
  merchXof: number;
  fanClubXof: number;
  tipsXof: number;
  ticketsXof: number;
  payoutsPendingXof: number;
  payoutsPaidXof: number;
  nextPayoutAt: string | null;
  payoutPhone: string | null;
  ledger: WalletLedgerRow[];
  payouts: WalletPayoutRow[];
  error: string | null;
};

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|schema cache/i.test(
    message,
  );
}

export async function loadArtistWallet(
  supabase: SupabaseClient,
  artistId: string,
): Promise<ArtistWalletSummary> {
  const empty: ArtistWalletSummary = {
    ready: false,
    balanceXof: 0,
    streamsXof: 0,
    downloadsXof: 0,
    merchXof: 0,
    fanClubXof: 0,
    tipsXof: 0,
    ticketsXof: 0,
    payoutsPendingXof: 0,
    payoutsPaidXof: 0,
    nextPayoutAt: null,
    payoutPhone: null,
    ledger: [],
    payouts: [],
    error: null,
  };

  try {
    await supabase.rpc("ensure_artist_wallet", { p_artist_id: artistId });

    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data: walletRow, error: walletErr } = await db
      .from("artist_wallets")
      .select("payout_phone, next_payout_at")
      .eq("artist_id", artistId)
      .maybeSingle();

    if (walletErr && isMissingRelation(walletErr.message)) {
      return { ...empty, error: "Run 20260830_monetization_stack.sql in Supabase." };
    }

    const { data: ledgerRows, error: ledgerErr } = await db
      .from("artist_wallet_ledger")
      .select("id, kind, amount_xof, reference_id, description, created_at")
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (ledgerErr && isMissingRelation(ledgerErr.message)) {
      return { ...empty, error: ledgerErr.message };
    }

    const ledger: WalletLedgerRow[] = (ledgerRows ?? []).map((r) => ({
      id: Number(r.id),
      kind: String(r.kind),
      amountXof: Number(r.amount_xof) || 0,
      referenceId:
        typeof r.reference_id === "string" ? r.reference_id : null,
      description: typeof r.description === "string" ? r.description : null,
      createdAt: String(r.created_at ?? ""),
    }));

    // Full-ledger totals (not truncated to recent 50 display rows).
    let balanceXof = 0;
    let streamsXof = 0;
    let downloadsXof = 0;
    let merchXof = 0;
    let fanClubXof = 0;
    let tipsXof = 0;
    let ticketsXof = 0;

    const { data: breakdown, error: breakdownErr } = await db.rpc(
      "artist_wallet_balance_breakdown",
      { p_artist_id: artistId },
    );

    if (!breakdownErr && breakdown && typeof breakdown === "object") {
      const b = breakdown as Record<string, unknown>;
      balanceXof = Number(b.balance_xof) || 0;
      streamsXof = Number(b.streams_xof) || 0;
      downloadsXof = Number(b.downloads_xof) || 0;
      merchXof = Number(b.merch_xof) || 0;
      fanClubXof = Number(b.fan_club_xof) || 0;
      tipsXof = Number(b.tips_xof) || 0;
      ticketsXof = Number(b.tickets_xof) || 0;
    } else {
      // Fallback: page through all ledger amounts (PostgREST max ~1000/page).
      let from = 0;
      const pageSize = 1000;
      for (;;) {
        const { data: page } = await db
          .from("artist_wallet_ledger")
          .select("kind, amount_xof")
          .eq("artist_id", artistId)
          .range(from, from + pageSize - 1);
        if (!page?.length) break;
        for (const r of page) {
          const amt = Number(r.amount_xof) || 0;
          balanceXof += amt;
          if (amt <= 0) continue;
          const kind = String(r.kind);
          if (kind === "stream") streamsXof += amt;
          else if (kind === "download") downloadsXof += amt;
          else if (kind === "merch") merchXof += amt;
          else if (kind === "fan_club") fanClubXof += amt;
          else if (kind === "tip") tipsXof += amt;
          else if (kind === "ticket") ticketsXof += amt;
        }
        if (page.length < pageSize) break;
        from += pageSize;
      }
    }

    const { data: payoutRows } = await db
      .from("artist_joko_payouts")
      .select(
        "id, amount_xof, status, payout_phone, scheduled_for, paid_at, joko_reference, created_at",
      )
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false })
      .limit(20);

    const payouts: WalletPayoutRow[] = (payoutRows ?? []).map((r) => ({
      id: Number(r.id),
      amountXof: Number(r.amount_xof) || 0,
      status: String(r.status),
      payoutPhone: String(r.payout_phone ?? ""),
      scheduledFor:
        typeof r.scheduled_for === "string" ? r.scheduled_for : null,
      paidAt: typeof r.paid_at === "string" ? r.paid_at : null,
      jokoReference:
        typeof r.joko_reference === "string" ? r.joko_reference : null,
      createdAt: String(r.created_at ?? ""),
    }));

    const payoutsPendingXof = payouts
      .filter((p) => p.status === "pending" || p.status === "processing")
      .reduce((s, p) => s + p.amountXof, 0);
    const payoutsPaidXof = payouts
      .filter((p) => p.status === "paid")
      .reduce((s, p) => s + p.amountXof, 0);

    return {
      ready: true,
      balanceXof,
      streamsXof,
      downloadsXof,
      merchXof,
      fanClubXof,
      tipsXof,
      ticketsXof,
      payoutsPendingXof,
      payoutsPaidXof,
      nextPayoutAt:
        typeof walletRow?.next_payout_at === "string"
          ? walletRow.next_payout_at
          : null,
      payoutPhone:
        typeof walletRow?.payout_phone === "string"
          ? walletRow.payout_phone
          : null,
      ledger,
      payouts,
      error: null,
    };
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : "Failed to load wallet",
    };
  }
}

export async function requestArtistPayout(
  supabase: SupabaseClient,
  amountXof: number,
  payoutPhone: string,
): Promise<
  | { ok: true; payoutId: number; scheduledFor: string | null; balanceAfter: number }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc("request_joko_payout", {
    p_amount_xof: amountXof,
    p_payout_phone: payoutPhone.trim(),
  });

  if (error) {
    if (/minimum_payout/i.test(error.message)) {
      return { ok: false, error: "Minimum payout is 500 XOF." };
    }
    if (/insufficient_balance/i.test(error.message)) {
      return { ok: false, error: "Insufficient wallet balance." };
    }
    if (/payout_phone_required/i.test(error.message)) {
      return { ok: false, error: "Enter your mobile money number." };
    }
    return { ok: false, error: error.message };
  }

  const row = data as Record<string, unknown> | null;
  return {
    ok: true,
    payoutId: Number(row?.payout_id),
    scheduledFor:
      typeof row?.scheduled_for === "string" ? row.scheduled_for : null,
    balanceAfter: Number(row?.balance_after) || 0,
  };
}
