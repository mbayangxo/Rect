import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { updateMerchItem } from "@/lib/dashboard/artist-merch";
import { uploadMerchPhoto } from "@/lib/dashboard/merch-image";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Photo is required." }, { status: 400 });
  }

  const upload = await uploadMerchPhoto(supabase, current.user.id, id, file);
  if (!upload.ok) {
    return NextResponse.json(
      { error: upload.error },
      { status: upload.status },
    );
  }

  const { data: existing } = await supabase
    .from("artist_merch_items")
    .select("image_urls")
    .eq("id", id)
    .eq("artist_id", current.user.id)
    .maybeSingle();

  const urls = Array.isArray(existing?.image_urls)
    ? existing.image_urls.filter((u): u is string => typeof u === "string")
    : [];

  const nextUrls = [...urls, upload.image_url];
  const result = await updateMerchItem(supabase, current.user.id, id, {
    image_urls: nextUrls,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    image_url: upload.image_url,
    item: result.item,
  });
}
