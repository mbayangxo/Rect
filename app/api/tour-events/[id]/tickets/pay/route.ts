import { NextResponse } from "next/server";
import {
  purchaseTourTicket,
  setTourTicketFekkReference,
} from "@/lib/dashboard/tour-events";
import { initiateFekkCheckout } from "@/lib/fekk/tickets";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type Body = { quantity?: number; phone?: string };

export async function POST(request: Request, ctx: Ctx) {
  const { id: eventId } = await ctx.params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const quantity = Math.max(1, Math.min(20, Math.round(Number(body.quantity) || 1)));
  const phone = (body.phone ?? "").trim();

  const supabase = await createRouteClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Sign in required.", authenticated: false },
      { status: 401 },
    );
  }

  const purchase = await purchaseTourTicket(supabase, eventId, quantity, phone);
  if (!purchase.ok) {
    const status =
      purchase.code === "auth"
        ? 401
        : purchase.code === "sold_out"
          ? 409
          : purchase.code === "event_not_found"
            ? 404
            : 400;
    return NextResponse.json(
      { error: purchase.error, code: purchase.code },
      { status },
    );
  }

  const fekk = await initiateFekkCheckout({
    purchaseId: purchase.purchaseId,
    eventId: Number(eventId),
    fekkEventId: purchase.fekkEventId,
    title: purchase.title,
    city: purchase.city,
    quantity: purchase.quantity,
    amountXof: purchase.priceXof,
    userId: user.id,
    phone: phone || null,
    existingCheckoutUrl: purchase.fekkCheckoutUrl,
  });

  if (!fekk.ok) {
    await supabase.rpc("cancel_tour_ticket_purchase", {
      p_purchase_id: purchase.purchaseId,
    });
    return NextResponse.json({ error: fekk.error }, { status: 502 });
  }

  await setTourTicketFekkReference(supabase, purchase.purchaseId, fekk.reference);

  if (fekk.instantConfirm) {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Server misconfigured for demo confirm." },
        { status: 503 },
      );
    }
    const { error } = await admin.rpc("confirm_tour_ticket_system", {
      p_purchase_id: purchase.purchaseId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      status: "confirmed",
      mode: fekk.mode,
      purchase_id: purchase.purchaseId,
      title: purchase.title,
      city: purchase.city,
      quantity: purchase.quantity,
      price_xof: purchase.priceXof,
      checkout_url: null,
    });
  }

  return NextResponse.json({
    ok: true,
    status: "pending",
    mode: fekk.mode,
    purchase_id: purchase.purchaseId,
    title: purchase.title,
    city: purchase.city,
    quantity: purchase.quantity,
    price_xof: purchase.priceXof,
    checkout_url: fekk.checkoutUrl,
  });
}
