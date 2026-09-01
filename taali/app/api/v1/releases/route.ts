import { NextRequest, NextResponse } from "next/server";
import { ApiKeyError, requireApiKey } from "@/lib/auth/api-key";
import { createRelease, listReleases } from "@/lib/taali/releases";
import type { CreateReleaseBody } from "@/lib/taali/types";
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

  const { data, error } = await listReleases(admin, organizationId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ releases: data });
}

export async function POST(request: NextRequest) {
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

  const body = (await request.json().catch(() => null)) as
    | CreateReleaseBody
    | null;

  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  if (!body.organization_id?.trim()) {
    return NextResponse.json(
      { error: "organization_id is required" },
      { status: 400 },
    );
  }

  const { release, tracks, error } = await createRelease(admin, body);
  if (error || !release) {
    return NextResponse.json(
      { error: error?.message || "Could not create release." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      id: release.id,
      release_id: release.id,
      release,
      tracks,
    },
    { status: 201 },
  );
}
