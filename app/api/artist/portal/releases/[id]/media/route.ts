import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { addPortalReleaseMedia } from "@/lib/dashboard/portal-releases";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";
import { TRACKS_BUCKET } from "@/lib/tracks";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;

type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  const { id: releaseId } = await params;
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const kindRaw = String(form.get("kind") ?? "photo");
  const caption = String(form.get("caption") ?? "").trim();
  const kind = kindRaw === "video" ? "video" : "photo";

  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 25MB)." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `portal/${current.user.id}/${releaseId}/${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from(TRACKS_BUCKET)
    .upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(TRACKS_BUCKET).getPublicUrl(path);
  const result = await addPortalReleaseMedia(supabase, current.user.id, releaseId, {
    kind,
    url: pub.publicUrl,
    caption: caption || undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, media: result.media });
}
