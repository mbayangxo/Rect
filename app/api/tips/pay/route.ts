import { NextResponse } from "next/server";
import { notifyArtist } from "@/lib/dashboard/notifications";
import {
  TIP_AMOUNTS_XOF,
  TIP_MESSAGE_MAX,
} from "@/lib/dashboard/tips";
import {
  initiateJokoPayment,
  isJokoPaymentMethod,
  jokoMethodLabel,
} from "@/lib/joko/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  artist_id?: string;
  amount_xof?: number;
  message?: string;
  track_id?: string;
  payment_method?: string;
  phone?: string;
};

/**
 * Tip via JOKO (Wave / Orange / MTN / JOKO wallet / debit).
 * Creates pending tip → initiates payment → confirms on webhook or demo instant.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const artistId = body.artist_id?.trim();
  const amount = Number(body.amount_xof);
  const message =
    typeof body.message === "string" ? body.message.trim() : "";
  const trackId =
    typeof body.track_id === "string" ? body.track_id.trim() : "";
  const paymentMethod = (body.payment_method ?? "wave").trim();
  const phone = (body.phone ?? "").trim();

  if (!artistId) {
    return NextResponse.json({ error: "artist_id is required" }, { status: 400 });
  }
  if (!(TIP_AMOUNTS_XOF as readonly number[]).includes(amount)) {
    return NextResponse.json(
      { error: "Choose 100, 200, or 500 XOF", code: "invalid_amount" },
      { status: 400 },
    );
  }
  if (!isJokoPaymentMethod(paymentMethod)) {
    return NextResponse.json(
      {
        error:
          "Choose Wave, Orange Money, MTN MoMo, JOKO wallet, debit, or mobile money.",
      },
      { status: 400 },
    );
  }
  if (phone.length < 8) {
    return NextResponse.json(
      { error: "Enter your mobile money / JOKO number." },
      { status: 400 },
    );
  }
  if (message.length > TIP_MESSAGE_MAX) {
    return NextResponse.json(
      { error: `Note must be ${TIP_MESSAGE_MAX} characters or fewer` },
      { status: 400 },
    );
  }

  const supabase = await createRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in required", authenticated: false },
      { status: 401 },
    );
  }
  if (user.id === artistId) {
    return NextResponse.json(
      { error: "You can’t tip yourself", code: "cannot_tip_self" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("create_pending_artist_tip", {
    p_artist_id: artistId,
    p_amount_xof: amount,
    p_payment_method: paymentMethod,
    p_message: message || null,
    p_track_id: trackId || null,
  });

  if (error) {
    const missing = /create_pending_artist_tip|Could not find the function|PGRST202/i.test(
      error.message,
    );
    return NextResponse.json(
      {
        error: missing
          ? "Run 20260831_joko_tips.sql in Supabase SQL Editor."
          : error.message,
        code: missing ? "missing_migration" : "tip_failed",
      },
      { status: missing ? 503 : 400 },
    );
  }

  const row = data as {
    tip_id?: number;
    amount_xof?: number;
    payment_method?: string;
    message?: string | null;
    track_id?: string | null;
  } | null;
  const tipId = row?.tip_id != null ? Number(row.tip_id) : null;
  if (!tipId) {
    return NextResponse.json({ error: "Tip create failed" }, { status: 500 });
  }

  const joko = await initiateJokoPayment({
    purchaseId: tipId,
    amountXof: amount,
    paymentMethod,
    phone,
    packName: `Tip · ${amount} XOF`,
    userId: user.id,
    product: "rect_tip",
    referencePrefix: `joko-tip-${tipId}`,
  });

  if (!joko.ok) {
    return NextResponse.json({ error: joko.error }, { status: 400 });
  }

  await supabase.rpc("set_tip_joko_reference", {
    p_tip_id: tipId,
    p_reference: joko.reference,
  });

  if (joko.instantConfirm) {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        {
          error:
            "Tip payment started but server cannot confirm without SUPABASE_SERVICE_ROLE_KEY. Tip stays pending until webhook.",
          code: "missing_service_role",
          tip_id: tipId,
          status: "pending",
          mode: joko.mode,
        },
        { status: 503 },
      );
    }
    const { error: confirmError } = await admin.rpc(
      "confirm_artist_tip_system",
      { p_tip_id: tipId },
    );
    if (confirmError) {
      return NextResponse.json(
        {
          error: confirmError.message,
          code: "confirm_failed",
          tip_id: tipId,
          status: "pending",
        },
        { status: 500 },
      );
    }
    await notifyArtist(admin, artistId, "tip", {
      amount_xof: amount,
      body: message || undefined,
      track_id: trackId || undefined,
      tip_id: tipId,
    });
  }

  return NextResponse.json({
    ok: true,
    tip_id: tipId,
    amount_xof: amount,
    payment_method: paymentMethod,
    payment_label: jokoMethodLabel(paymentMethod),
    mode: joko.mode,
    status: joko.instantConfirm ? "confirmed" : "pending",
    checkout_url: joko.checkoutUrl,
    message: (row?.message ?? message) || null,
    track_id: (row?.track_id ?? trackId) || null,
  });
}
