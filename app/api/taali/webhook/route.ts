import { NextResponse } from "next/server";
import { verifyTaaliWebhookSecret } from "@/lib/taali/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Taali → RECT delivery status webhook.
 * Point TAALI at POST /api/taali/webhook. Optional TAALI_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secretHeader =
    request.headers.get("x-taali-secret") ||
    request.headers.get("authorization");
  if (!verifyTaaliWebhookSecret(secretHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Admin client not configured." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    release_id?: string;
    external_id?: string;
    taali_release_id?: string;
    status?: string;
    store_links?: Record<string, string>;
    error?: string;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const externalId = body.external_id || body.release_id;
  if (!externalId) {
    return NextResponse.json({ error: "release id required" }, { status: 400 });
  }

  const statusRaw = (body.status || "").toLowerCase();
  let status:
    | "submitted"
    | "live"
    | "failed"
    | "takedown"
    | "queued"
    | null = null;
  if (statusRaw === "live" || statusRaw === "delivered") status = "live";
  else if (statusRaw === "failed" || statusRaw === "error") status = "failed";
  else if (statusRaw === "takedown" || statusRaw === "taken_down")
    status = "takedown";
  else if (statusRaw === "submitted" || statusRaw === "processing")
    status = "submitted";
  else if (statusRaw === "queued") status = "queued";

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (status) patch.status = status;
  if (body.taali_release_id) patch.taali_release_id = body.taali_release_id;
  if (body.store_links) patch.store_links = body.store_links;
  if (body.error) patch.last_error = body.error;
  if (status === "live") patch.live_at = new Date().toISOString();
  if (status === "failed") patch.last_error = body.error || "Delivery failed";

  const { error } = await admin
    .from("distribution_releases")
    .update(patch)
    .eq("id", externalId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await admin.from("distribution_delivery_events").insert({
    release_id: externalId,
    event_type: `webhook_${statusRaw || "update"}`,
    payload: body,
  });

  return NextResponse.json({ ok: true });
}
