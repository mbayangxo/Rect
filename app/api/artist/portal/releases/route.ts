import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import {
  loadPortalReleases,
  savePortalRelease,
} from "@/lib/dashboard/portal-releases";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  const result = await loadPortalReleases(supabase, current.user.id);
  return NextResponse.json(result);
}

type ReleaseBody = {
  id?: string;
  title?: string;
  kind?: string;
  description?: string;
  cover_url?: string | null;
  theme_color?: string;
  portal_audio_url?: string | null;
  track_id?: string | null;
  published?: boolean;
  sort_order?: number;
};

export async function POST(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  let body: ReleaseBody;
  try {
    body = (await request.json()) as ReleaseBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const result = await savePortalRelease(supabase, current.user.id, {
    id: body.id,
    title,
    kind: body.kind,
    description: body.description,
    coverUrl: body.cover_url,
    themeColor: body.theme_color,
    portalAudioUrl: body.portal_audio_url,
    trackId: body.track_id,
    published: body.published,
    sortOrder: body.sort_order,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, release: result.release });
}
