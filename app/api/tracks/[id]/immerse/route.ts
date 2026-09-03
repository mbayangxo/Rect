import { NextResponse } from "next/server";
import { loadArtistActiveLiveRoom } from "@/lib/dashboard/live-rooms";
import { loadPortalReleases } from "@/lib/dashboard/portal-releases";
import { loadArtistActiveRectLive } from "@/lib/dashboard/rect-live";
import { loadTrackWriterSplits } from "@/lib/dashboard/writer-splits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Enrich immersive Now Playing: live presence, portal door, writers, lyrics.
 * Public-safe — no secrets.
 */
export async function GET(request: Request, { params }: Params) {
  const { id: trackId } = await params;
  const url = new URL(request.url);
  const artistId =
    url.searchParams.get("artist_id")?.trim() || null;

  const supabase = await createRouteClient(request);
  const admin = createAdminClient();
  const db = admin ?? supabase;

  let lyrics: string | null = null;
  const { data: trackRow } = await db
    .from("tracks")
    .select("lyrics, artist_id")
    .eq("id", trackId)
    .maybeSingle();
  if (typeof trackRow?.lyrics === "string" && trackRow.lyrics.trim()) {
    lyrics = trackRow.lyrics;
  }
  const resolvedArtistId =
    artistId ||
    (typeof trackRow?.artist_id === "string" ? trackRow.artist_id : null);

  let live: {
    kind: "live_room" | "rect_live";
    href: string;
    title: string;
  } | null = null;
  let portal: { href: string; title: string } | null = null;
  let writers: { writer_name: string; share_percent: number }[] = [];

  if (resolvedArtistId) {
    const [roomRes, rectRes, portalsRes, writersRes] = await Promise.all([
      loadArtistActiveLiveRoom(db, resolvedArtistId),
      loadArtistActiveRectLive(db, resolvedArtistId),
      loadPortalReleases(db, resolvedArtistId, { publishedOnly: true }),
      loadTrackWriterSplits(db, trackId),
    ]);

    if (roomRes.room) {
      live = {
        kind: "live_room",
        href: `/artists/${resolvedArtistId}/live/${roomRes.room.id}`,
        title: roomRes.room.title || "Live Room",
      };
    } else if (rectRes.live) {
      live = {
        kind: "rect_live",
        href: `/artists/${resolvedArtistId}/rect-live/${rectRes.live.id}`,
        title: rectRes.live.title || "RECT Live",
      };
    }

    const match =
      portalsRes.releases.find((r) => r.trackId === trackId) ??
      portalsRes.releases[0] ??
      null;
    if (match) {
      portal = {
        href: `/artists/${resolvedArtistId}/world/${match.id}`,
        title: match.title,
      };
    }

    writers = (writersRes.writers ?? []).map((w) => ({
      writer_name: w.writer_name,
      share_percent: w.share_percent,
    }));
  }

  return NextResponse.json({
    lyrics,
    live,
    portal,
    writers,
  });
}
