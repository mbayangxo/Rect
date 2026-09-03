import { NextResponse } from "next/server";
import {
  setFanClubJokoReference,
  subscribeFanClubTier,
} from "@/lib/dashboard/fan-club";
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

type Props = { params: Promise<{ tierId: string }> };

export async function POST(request: Request, { params }: Props) {
  const { tierId: tierIdRaw } = await params;
  const tierId = Number(tierIdRaw);
  if (!Number.isFinite(tierId)) {
    return NextResponse.json({ error: "Invalid tier." }, { status: 400 });
  }

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

  const sub = await subscribeFanClubTier(
    supabase,
    tierId,
    paymentMethod,
    phone,
  );

  if (!sub.ok) {
    return NextResponse.json({ error: sub.error }, { status: 400 });
  }

  if (sub.skipped === "already_active" || sub.status === "active") {
    return NextResponse.json({
      ok: true,
      status: "active",
      member_id: sub.memberId,
      tier_name: sub.tierName,
      skipped: "already_active",
    });
  }

  const joko = await initiateJokoPayment({
    purchaseId: sub.memberId,
    amountXof: sub.priceXof,
    paymentMethod,
    phone,
    packName: sub.tierName,
    userId: user.id,
    product: "rect_fan_club",
    referencePrefix: `joko-fc-${sub.memberId}`,
  });

  if (!joko.ok) {
    await supabase.rpc("cancel_fan_club_subscribe", {
      p_member_id: sub.memberId,
    });
    return NextResponse.json({ error: joko.error }, { status: 502 });
  }

  await setFanClubJokoReference(supabase, sub.memberId, joko.reference);

  if (joko.instantConfirm) {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Server misconfigured for demo confirm." },
        { status: 503 },
      );
    }
    const { error } = await admin.rpc("confirm_fan_club_member_system", {
      p_member_id: sub.memberId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      status: "confirmed",
      mode: joko.mode,
      member_id: sub.memberId,
      tier_name: sub.tierName,
      payment_method: jokoMethodLabel(paymentMethod),
    });
  }

  return NextResponse.json({
    ok: true,
    status: "pending",
    mode: joko.mode,
    member_id: sub.memberId,
    payment_method: jokoMethodLabel(paymentMethod),
    checkout_url: joko.checkoutUrl,
  });
}
