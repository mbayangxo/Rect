import { NextResponse } from "next/server";
import {
  confirmMerchPurchase,
  purchaseMerchItem,
  setMerchJokoReference,
} from "@/lib/dashboard/artist-merch";
import {
  initiateJokoPayment,
  isJokoPaymentMethod,
  jokoMethodLabel,
} from "@/lib/joko/payments";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

type Body = {
  payment_method?: string;
  phone?: string;
};

export async function POST(request: Request, ctx: Ctx) {
  const { id: merchId } = await ctx.params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const paymentMethod = (body.payment_method ?? "wave").trim();
  if (!isJokoPaymentMethod(paymentMethod)) {
    return NextResponse.json(
      { error: "Choose Wave, Orange Money, MTN MoMo, or mobile money." },
      { status: 400 },
    );
  }

  const phone = (body.phone ?? "").trim();
  if (phone.length < 8) {
    return NextResponse.json(
      { error: "Enter your mobile money number to pay through JOKO." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Sign in required", authenticated: false },
      { status: 401 },
    );
  }

  const purchase = await purchaseMerchItem(
    supabase,
    merchId,
    paymentMethod,
    phone,
  );

  if (!purchase.ok) {
    const status =
      purchase.code === "not_authenticated"
        ? 401
        : purchase.code === "merch_not_found"
          ? 404
          : purchase.code === "sold_out"
            ? 409
            : purchase.code === "own_merch"
              ? 400
              : 500;
    return NextResponse.json(
      { error: purchase.error, code: purchase.code },
      { status },
    );
  }

  const joko = await initiateJokoPayment({
    purchaseId: purchase.purchase_id,
    amountXof: purchase.price_xof,
    paymentMethod,
    phone,
    packName: purchase.title,
    userId: user.id,
    product: "rect_merch",
  });

  if (!joko.ok) {
    return NextResponse.json({ error: joko.error }, { status: 502 });
  }

  await setMerchJokoReference(supabase, purchase.purchase_id, joko.reference);

  if (joko.instantConfirm) {
    const confirmed = await confirmMerchPurchase(
      supabase,
      purchase.purchase_id,
    );
    if (!confirmed.ok) {
      return NextResponse.json({ error: confirmed.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      status: "confirmed",
      mode: joko.mode,
      purchase_id: confirmed.purchase_id,
      title: confirmed.title,
      payment_method: jokoMethodLabel(paymentMethod),
      checkout_url: null,
    });
  }

  return NextResponse.json({
    ok: true,
    status: "pending",
    mode: joko.mode,
    purchase_id: purchase.purchase_id,
    title: purchase.title,
    payment_method: jokoMethodLabel(paymentMethod),
    checkout_url: joko.checkoutUrl,
  });
}
