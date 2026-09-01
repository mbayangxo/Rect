import { NextResponse } from "next/server";
import {
  fanHasRequestedCity,
  loadCityDemandForArtist,
  requestArtistCity,
} from "@/lib/dashboard/tour-demand";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const artistId = url.searchParams.get("artist_id")?.trim();
  if (!artistId) {
    return NextResponse.json({ error: "artist_id required" }, { status: 400 });
  }

  const supabase = await createRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const demand = await loadCityDemandForArtist(supabase, artistId);
  let myCities: string[] = [];
  if (user) {
    const mine = await fanHasRequestedCity(supabase, artistId, user.id);
    myCities = mine.cities;
  }

  return NextResponse.json({
    ready: demand.ready,
    rows: demand.rows,
    my_cities: myCities,
    error: demand.error,
  });
}

type Body = {
  artist_id?: string;
  city?: string;
  place?: string | null;
  note?: string | null;
};

export async function POST(request: Request) {
  const supabase = await createRouteClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Sign in required.", authenticated: false },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const artistId = (body.artist_id ?? "").trim();
  const city = (body.city ?? "").trim();
  if (!artistId || !city) {
    return NextResponse.json(
      { error: "artist_id and city are required." },
      { status: 400 },
    );
  }

  const result = await requestArtistCity(
    supabase,
    artistId,
    city,
    body.place,
    body.note,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, request_id: result.requestId, city });
}
