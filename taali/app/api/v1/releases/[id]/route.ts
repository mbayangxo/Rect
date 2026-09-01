import { NextRequest, NextResponse } from "next/server";
import { ApiKeyError, requireApiKey } from "@/lib/auth/api-key";
import { getReleaseWithTracks } from "@/lib/taali/releases";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function unauthorized(error: ApiKeyError) {
  const status = error.reason === "revoked" ? 403 : 401;
  return NextResponse.json({ error: error.message }, { status });
}

export async function GET(request: NextRequest, context: RouteContext) {
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

  const { id } = await context.params;
  const { release, tracks, error } = await getReleaseWithTracks(admin, id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  return NextResponse.json({ release, tracks });
}
