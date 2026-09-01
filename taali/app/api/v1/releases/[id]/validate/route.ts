import { NextRequest, NextResponse } from "next/server";
import { ApiKeyError, requireApiKey } from "@/lib/auth/api-key";
import { getReleaseWithTracks } from "@/lib/taali/releases";
import { validateReleaseMetadata } from "@/lib/taali/validate";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function unauthorized(error: ApiKeyError) {
  const status = error.reason === "revoked" ? 403 : 401;
  return NextResponse.json({ error: error.message }, { status });
}

export async function POST(request: NextRequest, context: RouteContext) {
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

  const result = validateReleaseMetadata(release, tracks);
  const validationStatus = result.valid ? "passed" : "failed";
  const nextStatus = result.valid ? "validated" : "draft";

  const { error: updateError } = await admin
    .from("releases")
    .update({
      validation_status: validationStatus,
      validation_issues: result.issues,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({
    release_id: id,
    valid: result.valid,
    validation_status: validationStatus,
    issues: result.issues,
  });
}
