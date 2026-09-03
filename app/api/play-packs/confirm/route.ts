import { NextResponse } from "next/server";
import { cancelPlayPackPurchase } from "@/lib/dashboard/credits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteClient } from "@/lib/supabase/route";
import { isJokoLive } from "@/lib/joko/payments";

type Body = { purchase_id?: string | number };

async function requireUser(request: Request) {
  const supabase = await createRouteClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      supabase,
      error: NextResponse.json(
        { error: "Sign in required", authenticated: false },
        { status: 401 },
      ),
    };
  }
  return { supabase, user, error: null as null };
}

/**
 * Manual confirm is demo-only. Live JOKO confirms via /api/joko/webhook.
 */
export async function POST(request: Request) {
  const allowDemo =
    !isJokoLive() &&
    (process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_DEMO_PAYMENTS === "true");
  if (!allowDemo) {
    return NextResponse.json(
      {
        error:
          "Manual confirm disabled. Wait for the JOKO webhook after payment.",
      },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const purchaseId =
    body.purchase_id == null ? "" : String(body.purchase_id).trim();
  if (!purchaseId) {
    return NextResponse.json(
      { error: "purchase_id is required" },
      { status: 400 },
    );
  }

  const auth = await requireUser(request);
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server misconfigured for demo confirm." },
      { status: 503 },
    );
  }

  const { data, error } = await admin.rpc("confirm_play_pack_purchase_system", {
    p_purchase_id: Number(purchaseId),
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const purchaseId =
    body.purchase_id == null ? "" : String(body.purchase_id).trim();
  if (!purchaseId) {
    return NextResponse.json(
      { error: "purchase_id is required" },
      { status: 400 },
    );
  }

  const auth = await requireUser(request);
  if (auth.error) return auth.error;

  const result = await cancelPlayPackPurchase(auth.supabase, purchaseId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.code === "missing_table" ? 503 : 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
