/**
 * JOKO payment rail boundary — RECT does not process cards or bank transfers.
 * When JOKO_API_URL is set, initiate live mobile-money collection.
 * Otherwise demo mode completes instantly after local confirm.
 */

export type JokoPaymentMethodId =
  | "wave"
  | "orange_money"
  | "mtn_momo"
  | "mobile_money"
  | "joko_wallet"
  | "debit";

export type JokoPaymentMethod = {
  id: JokoPaymentMethodId;
  label: string;
  shortLabel: string;
  description: string;
};

export const JOKO_PAYMENT_METHODS: JokoPaymentMethod[] = [
  {
    id: "wave",
    label: "Wave",
    shortLabel: "Wave",
    description: "Pay with your Wave wallet",
  },
  {
    id: "orange_money",
    label: "Orange Money",
    shortLabel: "Orange",
    description: "Orange Money · West Africa",
  },
  {
    id: "mtn_momo",
    label: "MTN MoMo",
    shortLabel: "MTN",
    description: "MTN Mobile Money",
  },
  {
    id: "joko_wallet",
    label: "JOKO Wallet",
    shortLabel: "JOKO",
    description: "Pay from your JOKO wallet balance",
  },
  {
    id: "debit",
    label: "Debit via JOKO",
    shortLabel: "Debit",
    description: "Debit card through JOKO",
  },
  {
    id: "mobile_money",
    label: "Other mobile money",
    shortLabel: "MoMo",
    description: "Any local mobile money via JOKO",
  },
];

export function isJokoPaymentMethod(value: string): value is JokoPaymentMethodId {
  return JOKO_PAYMENT_METHODS.some((m) => m.id === value);
}

export function jokoMethodLabel(id: string): string {
  return JOKO_PAYMENT_METHODS.find((m) => m.id === id)?.label ?? "Mobile money";
}

export function isJokoLive(): boolean {
  const url = process.env.JOKO_API_URL?.trim();
  const key = process.env.JOKO_API_KEY?.trim();
  return Boolean(url && key && url.startsWith("http"));
}

export type JokoInitiateInput = {
  purchaseId: number;
  amountXof: number;
  paymentMethod: JokoPaymentMethodId;
  phone: string;
  packName: string;
  userId: string;
  product?: string;
  referencePrefix?: string;
};

export type JokoInitiateResult =
  | {
      ok: true;
      mode: "live" | "demo";
      reference: string;
      /** Demo + successful stub — caller should confirm purchase immediately. */
      instantConfirm: boolean;
      checkoutUrl: string | null;
    }
  | { ok: false; error: string };

/**
 * Start a JOKO mobile-money payment. Live rail when configured; otherwise demo.
 */
export async function initiateJokoPayment(
  input: JokoInitiateInput,
): Promise<JokoInitiateResult> {
  const phone = input.phone.replace(/\s+/g, "").trim();
  if (!phone || phone.length < 8) {
    return { ok: false, error: "Enter a valid mobile money number." };
  }

  const reference = input.referencePrefix
    ? `${input.referencePrefix}-${Date.now()}`
    : `joko-${input.purchaseId}-${Date.now()}`;

  const product = input.product ?? "rect_play_pack";

  if (!isJokoLive()) {
    const allowDemo =
      process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_DEMO_PAYMENTS === "true";
    if (!allowDemo) {
      return {
        ok: false,
        error:
          "JOKO payments are not configured. Set JOKO_API_URL and JOKO_API_KEY.",
      };
    }
    return {
      ok: true,
      mode: "demo",
      reference,
      instantConfirm: true,
      checkoutUrl: null,
    };
  }

  const url = process.env.JOKO_API_URL!.replace(/\/$/, "");
  const key = process.env.JOKO_API_KEY!;

  try {
    const res = await fetch(`${url}/v1/payments/collect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        reference,
        amount_xof: input.amountXof,
        method: input.paymentMethod,
        phone,
        description: `RECT · ${input.packName}`,
        metadata: {
          purchase_id: input.purchaseId,
          ...(product === "rect_fan_club"
            ? { member_id: input.purchaseId }
            : {}),
          user_id: input.userId,
          product,
        },
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      status?: string;
      checkout_url?: string;
      reference?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: body.error || `JOKO payment failed (${res.status})`,
      };
    }

    const instant =
      body.status === "completed" || body.status === "succeeded";

    return {
      ok: true,
      mode: "live",
      reference: body.reference || reference,
      instantConfirm: instant,
      checkoutUrl: body.checkout_url ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not reach JOKO",
    };
  }
}
