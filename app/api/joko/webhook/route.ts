import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type WebhookBody = {
  reference?: string;
  status?: string;
  purchase_id?: number;
  member_id?: number;
  product?: string;
  metadata?: {
    purchase_id?: number;
    member_id?: number;
    product?: string;
  };
};

/**
 * JOKO payment webhook — confirms play packs, merch, downloads, fan club.
 * Requires JOKO_WEBHOOK_SECRET in production (NODE_ENV=production).
 */
export async function POST(request: Request) {
  const secret = process.env.JOKO_WEBHOOK_SECRET?.trim();
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !secret) {
    return NextResponse.json(
      { error: "JOKO_WEBHOOK_SECRET required in production." },
      { status: 503 },
    );
  }
  if (secret) {
    const header = request.headers.get("x-joko-signature");
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
  if (status !== "completed" && status !== "succeeded" && status !== "paid") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const product =
    body.product ??
    body.metadata?.product ??
    parseProductFromReference(body.reference);

  const purchaseId =
    body.purchase_id ??
    body.metadata?.purchase_id ??
    parsePurchaseIdFromReference(body.reference);

  // Fan club pay route sends member id as purchase_id in JOKO metadata.
  const memberId =
    body.member_id ??
    body.metadata?.member_id ??
    (product === "rect_fan_club" ? purchaseId : null) ??
    parseMemberIdFromReference(body.reference);

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 503 },
    );
  }

  if (product === "rect_fan_club") {
    if (!memberId) {
      return NextResponse.json(
        { error: "member_id required for fan club" },
        { status: 400 },
      );
    }
    const { data, error } = await admin.rpc("confirm_fan_club_member_system", {
      p_member_id: memberId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, product: "rect_fan_club", data });
  }

  if (product === "rect_merch") {
    if (!purchaseId) {
      return NextResponse.json(
        { error: "purchase_id required for merch" },
        { status: 400 },
      );
    }
    const { data, error } = await admin.rpc("confirm_merch_purchase_system", {
      p_purchase_id: purchaseId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, product: "rect_merch", data });
  }

  if (product === "rect_download") {
    if (!purchaseId) {
      return NextResponse.json(
        { error: "purchase_id required for download" },
        { status: 400 },
      );
    }
    const { data, error } = await admin.rpc("confirm_track_download_system", {
      p_purchase_id: purchaseId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, product: "rect_download", data });
  }

  if (product === "rect_tip") {
    if (!purchaseId) {
      return NextResponse.json(
        { error: "tip_id required for tips" },
        { status: 400 },
      );
    }
    const { data, error } = await admin.rpc("confirm_artist_tip_system", {
      p_tip_id: purchaseId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, product: "rect_tip", data });
  }

  if (!purchaseId) {
    return NextResponse.json(
      { error: "purchase_id or reference required" },
      { status: 400 },
    );
  }

  // Default: play pack only — never fall through from other products.
  if (product && product !== "rect_play_pack") {
    return NextResponse.json(
      { error: `Unhandled product: ${product}` },
      { status: 400 },
    );
  }

  const { data: row } = await admin
    .from("play_pack_purchases")
    .select("id, status")
    .eq("id", purchaseId)
    .maybeSingle();

  if (!row || row.status !== "pending") {
    return NextResponse.json({ ok: true, already: true });
  }

  const { data: confirmed, error } = await admin.rpc(
    "confirm_play_pack_purchase_system",
    { p_purchase_id: purchaseId },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    product: "rect_play_pack",
    purchase_id: purchaseId,
    balance: confirmed?.balance ?? null,
  });
}

function parsePurchaseIdFromReference(reference?: string): number | null {
  if (!reference) return null;
  // Do not match joko-fc- here — that is a member id.
  if (reference.startsWith("joko-fc-")) return null;
  const match = /^joko-(?:merch-|dl-)?(\d+)-/.exec(reference);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function parseMemberIdFromReference(reference?: string): number | null {
  if (!reference) return null;
  const match = /^joko-fc-(\d+)-/.exec(reference);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function parseProductFromReference(reference?: string): string | undefined {
  if (!reference) return undefined;
  if (reference.startsWith("joko-fc-")) return "rect_fan_club";
  if (reference.includes("-dl-")) return "rect_download";
  if (reference.includes("-merch-")) return "rect_merch";
  return "rect_play_pack";
}
