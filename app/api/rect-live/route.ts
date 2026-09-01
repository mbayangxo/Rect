import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import {
  endRectLive,
  loadArtistActiveRectLive,
  startRectLive,
} from "@/lib/dashboard/rect-live";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const result = await loadArtistActiveRectLive(supabase, user.id);
  if (result.missingTable) {
    return NextResponse.json(
      { error: "Run RECT Live SQL", code: "missing_table", live: null },
      { status: 503 },
    );
  }
  return NextResponse.json({ live: result.live });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("users")
    .select("account_type, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isArtistAccount(profile, user)) {
    return NextResponse.json({ error: "Artists only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string;
    visibility?: string;
    host?: string;
    portal_release_id?: string;
    country?: string;
    city?: string;
  };

  const result = await startRectLive(supabase, {
    title: typeof body.title === "string" ? body.title : "RECT Live",
    visibility: (body.visibility as "public") || "public",
    host: body.host === "portal" ? "portal" : "world",
    portalReleaseId: body.portal_release_id ?? null,
    country: body.country,
    city: body.city,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.code === "missing_table" ? 503 : 400 },
    );
  }
  return NextResponse.json({
    ok: true,
    rect_live_id: result.rect_live_id,
    skipped: result.skipped ?? null,
  });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const body = (await request.json()) as { rect_live_id?: string };
  const id = body.rect_live_id?.trim();
  if (!id) {
    return NextResponse.json({ error: "rect_live_id required" }, { status: 400 });
  }
  const result = await endRectLive(supabase, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
