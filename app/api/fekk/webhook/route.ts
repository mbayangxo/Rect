import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type WebhookBody = {
  reference?: string;
  status?: string;
  purchase_id?: number;
  ticket_id?: string;
  metadata?: {
    purchase_id?: number;
    product?: string;
  };
};

/**
 * FEKK ticket webhook — confirm tour ticket purchases.
 * Point FEKK at POST /api/fekk/webhook. Optional FEKK_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.FEKK_WEBHOOK_SECRET?.trim();
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !secret) {
    return NextResponse.json(
      { error: "FEKK_WEBHOOK_SECRET required in production." },
      { status: 503 },
    );
  }
  if (secret) {
    const header =
      request.headers.get("x-fekk-signature") ??
      request.headers.get("x-webhook-secret");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = (body.status ?? "").toLowerCase();
  if (
    status !== "completed" &&
    status !== "succeeded" &&
    status !== "paid" &&
    status !== "confirmed"
  ) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const purchaseId =
    body.purchase_id ??
    body.metadata?.purchase_id ??
    parsePurchaseId(body.reference);

  if (!purchaseId) {
    return NextResponse.json(
      { error: "purchase_id or reference required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 503 },
    );
  }

  const { data, error } = await admin.rpc("confirm_tour_ticket_system", {
    p_purchase_id: purchaseId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.ticket_id) {
    await admin
      .from("tour_ticket_purchases")
      .update({ fekk_ticket_id: body.ticket_id })
      .eq("id", purchaseId);
  }

  return NextResponse.json({
    ok: true,
    product: "rect_tour_ticket",
    purchase_id: purchaseId,
    data,
  });
}

function parsePurchaseId(reference?: string): number | null {
  if (!reference) return null;
  const match = /^fekk-ticket-(\d+)-/.exec(reference);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}
