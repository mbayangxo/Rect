import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  WalletLedgerRow,
  WalletPayoutRow,
} from "@/lib/dashboard/artist-wallet";

export type LabelWalletSummary = {
  ready: boolean;
  labelId: string;
  labelName: string;
  balanceXof: number;
  splitsXof: number;
  payoutPhone: string | null;
  nextPayoutAt: string | null;
  ledger: WalletLedgerRow[];
  error: string | null;
  missingTable: boolean;
};

function isMissing(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|schema cache/i.test(
    message,
  );
}

/**
 * Label wallet — only for rect_labels.owner_id.
 * Never shown to fans or roster artists who don't own the label.
 */
export async function loadLabelWallet(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<LabelWalletSummary | null> {
  const { data: label, error: labelErr } = await supabase
    .from("rect_labels")
    .select("id, name, owner_id")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (labelErr) {
    if (isMissing(labelErr.message)) return null;
    return {
      ready: false,
      labelId: "",
      labelName: "",
      balanceXof: 0,
      splitsXof: 0,
      payoutPhone: null,
      nextPayoutAt: null,
      ledger: [],
      error: labelErr.message,
      missingTable: false,
    };
  }
  if (!label) return null;

  const labelId = String(label.id);
  const labelName =
    (typeof label.name === "string" && label.name.trim()) || "Label";

  const admin = createAdminClient();
  const db = admin ?? supabase;

  try {
    await db.rpc("ensure_label_wallet", { p_label_id: labelId });
  } catch {
    // optional
  }

  const { data: walletRow, error: walletErr } = await db
    .from("label_wallets")
    .select("payout_phone, next_payout_at")
    .eq("label_id", labelId)
    .maybeSingle();

  if (walletErr && isMissing(walletErr.message)) {
    return {
      ready: false,
      labelId,
      labelName,
      balanceXof: 0,
      splitsXof: 0,
      payoutPhone: null,
      nextPayoutAt: null,
      ledger: [],
      error: "Run 20260904_wallets_personal_business_label.sql in Supabase.",
      missingTable: true,
    };
  }

  const { data: ledgerRows, error: ledgerErr } = await db
    .from("label_wallet_ledger")
    .select("id, kind, amount_xof, reference_id, description, created_at")
    .eq("label_id", labelId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (ledgerErr && isMissing(ledgerErr.message)) {
    return {
      ready: false,
      labelId,
      labelName,
      balanceXof: 0,
      splitsXof: 0,
      payoutPhone: null,
      nextPayoutAt: null,
      ledger: [],
      error: "Run 20260904_wallets_personal_business_label.sql in Supabase.",
      missingTable: true,
    };
  }

  const ledger: WalletLedgerRow[] = (ledgerRows ?? []).map((r) => ({
    id: Number(r.id),
    kind: String(r.kind),
    amountXof: Number(r.amount_xof) || 0,
    referenceId: typeof r.reference_id === "string" ? r.reference_id : null,
    description: typeof r.description === "string" ? r.description : null,
    createdAt: String(r.created_at ?? ""),
  }));

  let balanceXof = 0;
  let splitsXof = 0;

  const { data: breakdown } = await db.rpc("label_wallet_balance_breakdown", {
    p_label_id: labelId,
  });
  if (breakdown && typeof breakdown === "object") {
    const b = breakdown as Record<string, unknown>;
    balanceXof = Number(b.balance_xof) || 0;
    splitsXof = Number(b.splits_xof) || 0;
  } else {
    for (const row of ledger) {
      balanceXof += row.amountXof;
      if (row.kind === "label_split" && row.amountXof > 0) {
        splitsXof += row.amountXof;
      }
    }
  }

  return {
    ready: true,
    labelId,
    labelName,
    balanceXof,
    splitsXof,
    payoutPhone:
      typeof walletRow?.payout_phone === "string"
        ? walletRow.payout_phone
        : null,
    nextPayoutAt:
      typeof walletRow?.next_payout_at === "string"
        ? walletRow.next_payout_at
        : null,
    ledger,
    error: null,
    missingTable: false,
  };
}

export type { WalletPayoutRow };
