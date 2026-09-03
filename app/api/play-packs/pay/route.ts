import { NextResponse } from "next/server";
import {
  purchasePlayPack,
  setPlayPackJokoReference,
} from "@/lib/dashboard/credits";
import {
  initiateJokoPayment,
  isJokoPaymentMethod,
  jokoMethodLabel,
} from "@/lib/joko/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteClient } from "@/lib/supabase/route";

type Body = {
  pack_id?: string | number;
  payment_method?: string;
  phone?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const packId = body.pack_id == null ? "" : String(body.pack_id).trim();
  if (!packId) {
    return NextResponse.json({ error: "pack_id is required" }, { status: 400 });
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

  const supabase = await createRouteClient(request);
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

  const purchase = await purchasePlayPack(supabase, packId, {
    paymentMethod,
    phone,
  });

  if (!purchase.ok) {
    const status =
      purchase.code === "not_authenticated"
        ? 401
        : purchase.code === "pack_not_found"
          ? 404
          : purchase.code === "missing_table"
            ? 503
            : 500;
    return NextResponse.json(
      { error: purchase.error, code: purchase.code },
      { status },
    );
  }

  if (purchase.purchase_id == null) {
    return NextResponse.json(
      { error: "Purchase could not be started." },
      { status: 500 },
    );
  }

  const joko = await initiateJokoPayment({
    purchaseId: purchase.purchase_id,
    amountXof: purchase.price_xof ?? 0,
    paymentMethod,
    phone,
    packName: purchase.pack_name ?? "Play pack",
    userId: user.id,
  });

  if (!joko.ok) {
    await supabase.rpc("cancel_play_pack_purchase", {
      p_purchase_id: purchase.purchase_id,
    });
    return NextResponse.json({ error: joko.error }, { status: 502 });
  }

  await setPlayPackJokoReference(supabase, purchase.purchase_id, joko.reference);

  if (joko.instantConfirm) {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Server misconfigured for demo confirm." },
        { status: 503 },
      );
    }
    const { data, error } = await admin.rpc("confirm_play_pack_purchase_system", {
      p_purchase_id: purchase.purchase_id,
    });
    if (error) {
      return NextResponse.json(
        { error: error.message, code: "failed" },
        { status: 500 },
      );
    }
    const row = data as Record<string, unknown> | null;

    return NextResponse.json({
      ok: true,
      status: "confirmed",
      mode: joko.mode,
      purchase_id: Number(row?.purchase_id ?? purchase.purchase_id),
      credits_granted: Number(row?.credits_granted) || 0,
      balance: Number(row?.balance) || 0,
      pack_name: String(row?.pack_name ?? purchase.pack_name ?? "Play pack"),
      payment_method: jokoMethodLabel(paymentMethod),
      checkout_url: null,
    });
  }

  return NextResponse.json({
    ok: true,
    status: "pending",
    mode: joko.mode,
    purchase_id: purchase.purchase_id,
    credits_granted: 0,
    credits_pending: purchase.credits_pending,
    balance: purchase.balance,
    pack_name: purchase.pack_name,
    payment_method: jokoMethodLabel(paymentMethod),
    checkout_url: joko.checkoutUrl,
  });
}
