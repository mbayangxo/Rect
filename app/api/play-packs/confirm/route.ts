import { NextResponse } from "next/server";
import {
  cancelPlayPackPurchase,
  confirmPlayPackPurchase,
} from "@/lib/dashboard/credits";
import { createClient } from "@/lib/supabase/server";

type Body = { purchase_id?: string | number };

async function requireUser() {
  const supabase = await createClient();
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

export async function POST(request: Request) {
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

  const auth = await requireUser();
  if (auth.error) return auth.error;

  const result = await confirmPlayPackPurchase(auth.supabase, purchaseId);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "purchase_not_found"
          ? 404
          : result.code === "missing_table"
            ? 503
            : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json(result);
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

  const auth = await requireUser();
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
