import { NextResponse } from "next/server";
import {
  purchaseTrackDownload,
  setTrackDownloadJokoReference,
} from "@/lib/dashboard/track-downloads-paid";
import {
  initiateJokoPayment,
  isJokoPaymentMethod,
  jokoMethodLabel,
} from "@/lib/joko/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteClient } from "@/lib/supabase/route";

type Body = {
  payment_method?: string;
  phone?: string;
};

type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  const { id: trackId } = await params;

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

  const purchase = await purchaseTrackDownload(
    supabase,
    trackId,
    paymentMethod,
    phone,
  );

  if (!purchase.ok) {
    const status = /not for sale|already own/i.test(purchase.error) ? 400 : 500;
    return NextResponse.json({ error: purchase.error }, { status });
  }

  const joko = await initiateJokoPayment({
    purchaseId: purchase.purchaseId,
    amountXof: purchase.priceXof,
    paymentMethod,
    phone,
    packName: "Track download",
    userId: user.id,
    product: "rect_download",
    referencePrefix: `joko-dl-${purchase.purchaseId}`,
  });

  if (!joko.ok) {
    await supabase.rpc("cancel_track_download_purchase", {
      p_purchase_id: purchase.purchaseId,
    });
    return NextResponse.json({ error: joko.error }, { status: 502 });
  }

  await setTrackDownloadJokoReference(supabase, purchase.purchaseId, joko.reference);

  if (joko.instantConfirm) {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Server misconfigured for demo confirm." },
        { status: 503 },
      );
    }
    const { error } = await admin.rpc("confirm_track_download_system", {
      p_purchase_id: purchase.purchaseId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      status: "confirmed",
      mode: joko.mode,
      purchase_id: purchase.purchaseId,
      payment_method: jokoMethodLabel(paymentMethod),
    });
  }

  return NextResponse.json({
    ok: true,
    status: "pending",
    mode: joko.mode,
    purchase_id: purchase.purchaseId,
    payment_method: jokoMethodLabel(paymentMethod),
    checkout_url: joko.checkoutUrl,
  });
}
