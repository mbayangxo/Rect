/**
 * FEKK ticketing rail — RECT lists shows; FEKK sells tickets.
 * When FEKK_API_URL + FEKK_API_KEY are set, checkout is live.
 * Otherwise demo mode confirms instantly (local RPC).
 */

export function isFekkLive(): boolean {
  const url = process.env.FEKK_API_URL?.trim();
  const key = process.env.FEKK_API_KEY?.trim();
  return Boolean(url && key && url.startsWith("http"));
}

export type FekkCheckoutInput = {
  purchaseId: number;
  eventId: number;
  fekkEventId: string | null;
  title: string;
  city: string;
  quantity: number;
  amountXof: number;
  userId: string;
  phone?: string | null;
  existingCheckoutUrl?: string | null;
};

export type FekkCheckoutResult =
  | {
      ok: true;
      mode: "live" | "demo";
      reference: string;
      instantConfirm: boolean;
      checkoutUrl: string | null;
    }
  | { ok: false; error: string };

export async function initiateFekkCheckout(
  input: FekkCheckoutInput,
): Promise<FekkCheckoutResult> {
  const reference = `fekk-ticket-${input.purchaseId}-${Date.now().toString(36)}`;

  if (!isFekkLive()) {
    const allowDemo =
      process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_DEMO_PAYMENTS === "true";
    if (!allowDemo) {
      return {
        ok: false,
        error:
          "FEKK ticketing is not configured. Set FEKK_API_URL and FEKK_API_KEY.",
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

  const base = process.env.FEKK_API_URL!.replace(/\/$/, "");
  const key = process.env.FEKK_API_KEY!;

  try {
    // Prefer an artist-linked FEKK checkout URL when already published on FEKK.
    if (input.existingCheckoutUrl?.startsWith("http")) {
      const url = new URL(input.existingCheckoutUrl);
      url.searchParams.set("rect_purchase_id", String(input.purchaseId));
      url.searchParams.set("reference", reference);
      return {
        ok: true,
        mode: "live",
        reference,
        instantConfirm: false,
        checkoutUrl: url.toString(),
      };
    }

    const res = await fetch(`${base}/v1/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "x-api-key": key,
      },
      body: JSON.stringify({
        reference,
        product: "rect_tour_ticket",
        purchase_id: input.purchaseId,
        event_id: input.fekkEventId ?? String(input.eventId),
        title: input.title,
        city: input.city,
        quantity: input.quantity,
        amount_xof: input.amountXof,
        currency: "XOF",
        user_id: input.userId,
        phone: input.phone ?? undefined,
        success_url: process.env.FEKK_SUCCESS_URL ?? undefined,
        cancel_url: process.env.FEKK_CANCEL_URL ?? undefined,
        webhook_url: (() => {
          if (process.env.FEKK_WEBHOOK_URL?.trim()) {
            return process.env.FEKK_WEBHOOK_URL.trim();
          }
          const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
          return site ? `${site}/api/fekk/webhook` : undefined;
        })(),
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      checkout_url?: string;
      url?: string;
      reference?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: data.error || data.message || `FEKK error (${res.status})`,
      };
    }

    const checkoutUrl = data.checkout_url ?? data.url ?? null;
    return {
      ok: true,
      mode: "live",
      reference: data.reference ?? reference,
      instantConfirm: false,
      checkoutUrl,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "FEKK network error",
    };
  }
}
