import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import {
  createDistributionRelease,
  listDistributionReleases,
  submitDistributionRelease,
} from "@/lib/dashboard/distribution";
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

  const result = await listDistributionReleases(supabase, current.user.id);
  return NextResponse.json({
    releases: result.releases,
    missingTable: result.missingTable,
    error: result.error,
    taaliLive: result.taaliLive,
  });
}

export async function POST(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    title?: string;
    upc?: string;
    release_date?: string;
    cover_art_url?: string;
    territories?: string[];
    dsp_targets?: string[];
    track_ids?: string[];
    isrcs?: Record<string, string>;
    release_id?: string;
  } | null;

  if (body?.action === "submit" && body.release_id) {
    const result = await submitDistributionRelease(
      supabase,
      body.release_id,
      current.user.id,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  const title = body?.title?.trim();
  const trackIds = Array.isArray(body?.track_ids) ? body.track_ids : [];
  if (!title) {
    return NextResponse.json({ error: "Title required." }, { status: 400 });
  }

  const created = await createDistributionRelease(supabase, {
    artistId: current.user.id,
    title,
    upc: body?.upc ?? null,
    releaseDate: body?.release_date ?? null,
    coverArtUrl: body?.cover_art_url ?? null,
    territories: body?.territories,
    dspTargets: body?.dsp_targets,
    trackIds,
    isrcs: body?.isrcs,
  });

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, release_id: created.releaseId });
}
