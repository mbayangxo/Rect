import { NextRequest, NextResponse } from "next/server";
import { ApiKeyError, requireApiKey } from "@/lib/auth/api-key";
import { createDelivery } from "@/lib/taali/deliveries";
import { getReleaseWithTracks } from "@/lib/taali/releases";
import { validateReleaseMetadata } from "@/lib/taali/validate";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type SubmitBody = {
  provider_id?: string;
  destinations?: string[];
};

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
  const body = (await request.json().catch(() => null)) as SubmitBody | null;

  if (!body?.provider_id?.trim()) {
    return NextResponse.json(
      { error: "provider_id is required" },
      { status: 400 },
    );
  }

  const destinations = Array.isArray(body.destinations)
    ? body.destinations.filter((d) => typeof d === "string" && d.trim())
    : [];

  if (!destinations.length) {
    return NextResponse.json(
      { error: "destinations must be a non-empty array" },
      { status: 400 },
    );
  }

  const { release, tracks, error } = await getReleaseWithTracks(admin, id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  const validation = validateReleaseMetadata(release, tracks);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: "Release failed metadata validation. Run validate first.",
        issues: validation.issues,
      },
      { status: 422 },
    );
  }

  const { delivery, error: deliveryError } = await createDelivery(admin, {
    releaseId: id,
    organizationId: release.organization_id,
    providerId: body.provider_id.trim(),
    destinations,
  });

  if (deliveryError || !delivery) {
    return NextResponse.json(
      { error: deliveryError?.message || "Could not queue delivery." },
      { status: 400 },
    );
  }

  const nextReleaseStatus =
    delivery.status === "not_configured" ? "validated" : "submitted";

  await admin
    .from("releases")
    .update({
      status: nextReleaseStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({
    release_id: id,
    delivery,
    status: delivery.status,
    message:
      delivery.status === "not_configured"
        ? "Delivery recorded but provider is not configured yet."
        : "Delivery queued.",
  });
}
