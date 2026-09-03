import { NextRequest, NextResponse } from "next/server";
import { ApiKeyError, requireApiKey } from "@/lib/auth/api-key";
import { listDeliveries } from "@/lib/taali/deliveries";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function unauthorized(error: ApiKeyError) {
  const status = error.reason === "revoked" ? 403 : 401;
  return NextResponse.json({ error: error.message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    await requireApiKey(request);
  } catch (e) {
    if (e instanceof ApiKeyError) return unauthorized(e);
    throw e;
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase admin client is not configured." },
      { status: 503 },
    );
  }

  const organizationId =
    request.nextUrl.searchParams.get("organization_id") ?? undefined;

  if (!organizationId) {
    return NextResponse.json(
      { error: "organization_id query parameter is required" },
      { status: 400 },
    );
  }

  const { data, error } = await listDeliveries(admin, organizationId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ deliveries: data });
}
