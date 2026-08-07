import { NextResponse } from "next/server";
import { loadArtistPortals } from "@/lib/dashboard/artists";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { loadPlayPacks } from "@/lib/dashboard/play-packs";
import {
  loadDakarChart,
  loadFeaturedTracks,
} from "@/lib/dashboard/tracks";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Verify dashboard Connections 1–5 against live Supabase for the session. */
export async function GET() {
  try {
    const supabase = await createClient();
    const current = await getDashboardCurrentUser(supabase);

    if (!current.ok && current.reason === "no_session") {
      return NextResponse.json(
        { authenticated: false, error: "no_session" },
        { status: 401 },
      );
    }

    const [featured, chart, artists, packs] = await Promise.all([
      loadFeaturedTracks(supabase),
      loadDakarChart(supabase),
      loadArtistPortals(supabase),
      loadPlayPacks(supabase, "SN"),
    ]);

    return NextResponse.json({
      connection_1: {
        verified: current.ok,
        displayName: current.ok ? current.displayName : null,
        error: current.ok ? null : current.error,
        users_row: current.ok ? current.profile : null,
      },
      connection_2: {
        verified: featured.ok,
        count: featured.tracks.length,
        empty: featured.empty,
        empty_message: featured.empty
          ? "No tracks yet. Artists are uploading."
          : null,
        error: featured.ok ? null : featured.error,
        sample: featured.tracks.slice(0, 2).map((t) => ({
          id: t.id,
          title: t.title,
          play_count: t.play_count,
          artist_name: t.artist_name,
        })),
      },
      connection_3: {
        verified: chart.ok,
        count: chart.tracks.length,
        empty: chart.empty,
        empty_message: chart.empty ? "Charts launching soon." : null,
        error: chart.ok ? null : chart.error,
        sample: chart.tracks.slice(0, 2).map((t) => ({
          id: t.id,
          title: t.title,
          play_count: t.play_count,
        })),
      },
      connection_4: {
        verified: artists.ok,
        count: artists.artists.length,
        empty: artists.empty,
        empty_message: artists.empty ? "Artists joining soon." : null,
        error: artists.ok ? null : artists.error,
        sample: artists.artists.map((a) => ({
          id: a.id,
          display_name: a.display_name,
          genre: a.genre,
        })),
      },
      connection_5: {
        verified: packs.ok,
        count: packs.packs.length,
        empty: packs.empty,
        missing_table: "missingTable" in packs ? packs.missingTable : false,
        error: packs.ok ? null : packs.error,
        packs: packs.packs.map((p) => ({
          code: p.code,
          name: p.name,
          country: p.country,
        })),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "verify failed" },
      { status: 500 },
    );
  }
}
