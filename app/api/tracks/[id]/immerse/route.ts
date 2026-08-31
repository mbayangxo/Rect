import { NextResponse } from "next/server";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { loadArtistMerchItems } from "@/lib/dashboard/artist-merch";
import { genreToSlug } from "@/lib/dashboard/genres";
import {
  loadFriendsWhoLikedTrack,
  loadLikedAmongTrackIds,
  loadTrackLikeCount,
} from "@/lib/dashboard/likes";
import { PRIVATE_ARTIST_LABEL } from "@/lib/dashboard/privacy";
import { loadRectScoreRankedTracks } from "@/lib/dashboard/standings";
import { tipsTableReady } from "@/lib/dashboard/tips";
import { loadTrackWriterSplits } from "@/lib/dashboard/writer-splits";
import { parseLyricsText } from "@/lib/immerse/lyrics";
import { createClient } from "@/lib/supabase/server";
import {
  isPublishedTrack,
  trackArtist,
  trackTitle,
  type TrackRow,
} from "@/lib/tracks";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function isMissingColumn(message: string) {
  return /column .* does not exist|PGRST204/i.test(message);
}

type Door = {
  id: string;
  label: string;
  href: string;
  kind: "portal" | "live";
  hint?: string;
};

/** Enrichment payload for the immersive Now Playing stage. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const trackId = id?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "Track id required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const withLyrics = await supabase
    .from("tracks")
    .select(
      "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at, lyrics",
    )
    .eq("id", trackId)
    .maybeSingle();

  let row = withLyrics.data as (TrackRow & { lyrics?: string | null }) | null;
  let error = withLyrics.error;
  let lyricsRaw: string | null = null;

  if (error && isMissingColumn(error.message)) {
    const lean = await supabase
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at",
      )
      .eq("id", trackId)
      .maybeSingle();
    row = lean.data as typeof row;
    error = lean.error;
  } else if (row && typeof row.lyrics === "string") {
    lyricsRaw = row.lyrics;
  }

  if (
    error &&
    /language|column .* does not exist/i.test(error.message)
  ) {
    const bare = await supabase
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
      )
      .eq("id", trackId)
      .maybeSingle();
    row = bare.data as typeof row;
    error = bare.error;
  }

  if (error || !row) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }

  const isOwner = user?.id === row.artist_id;
  if (!isPublishedTrack(row) && !isOwner) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }

  let artist_name: string | null = null;
  if (row.artist_id) {
    const names = await loadArtistCreditMap(supabase, [row.artist_id]);
    artist_name = names.get(row.artist_id) ?? null;
  }

  const track: TrackRow = { ...row, artist_name };
  const artistLabel = trackArtist(track);
  const artistIsPublic =
    Boolean(track.artist_id) && artistLabel !== PRIVATE_ARTIST_LABEL;
  const genreSlug = track.genre ? genreToSlug(track.genre) : "";

  const [
    writersRes,
    likeCountRes,
    likedRes,
    friendsLikedRes,
    tipsReady,
    merchRes,
    playCountRes,
  ] = await Promise.all([
    loadTrackWriterSplits(supabase, trackId),
    loadTrackLikeCount(supabase, trackId),
    user
      ? loadLikedAmongTrackIds(supabase, user.id, [trackId])
      : Promise.resolve({ likedIds: [] as string[], missingTable: false, error: null }),
    user
      ? loadFriendsWhoLikedTrack(supabase, user.id, trackId, 8)
      : Promise.resolve({
          likers: [] as { id: string; display_name: string | null }[],
          missingTable: false,
          error: null,
        }),
    track.artist_id && artistIsPublic
      ? tipsTableReady(supabase)
      : Promise.resolve(false),
    track.artist_id && artistIsPublic
      ? loadArtistMerchItems(supabase, track.artist_id, { publicOnly: true })
      : Promise.resolve({ items: [], missingTable: false, error: null }),
    supabase
      .from("track_play_counts")
      .select("play_count")
      .eq("track_id", trackId)
      .maybeSingle(),
  ]);

  let chart: {
    position: number | null;
    board: string | null;
    rect_score: number | null;
    href: string | null;
  } = {
    position: null,
    board: null,
    rect_score: null,
    href: null,
  };

  try {
    const ranked = await loadRectScoreRankedTracks(
      supabase,
      40,
      track.genre ? { genre: track.genre } : undefined,
    );
    const hit = ranked.find((e) => e.id === trackId);
    if (hit) {
      chart = {
        position: hit.chart_position,
        board: track.genre
          ? `${track.genre} standings`
          : "RECT SCORE standings",
        rect_score: Math.round(hit.rect_score * 10) / 10,
        href: track.genre && genreSlug ? `/genres/${genreSlug}` : "/charts",
      };
    }
  } catch {
    /* chart enrichment is best-effort */
  }

  const play_count =
    !playCountRes.error && playCountRes.data
      ? Number(
          (playCountRes.data as { play_count?: number }).play_count,
        ) || 0
      : 0;

  const doors: Door[] = [
    {
      id: "song",
      label: "Song page",
      href: `/songs/${trackId}`,
      kind: "live",
      hint: "Credits & comments",
    },
  ];

  if (track.artist_id && artistIsPublic) {
    doors.unshift({
      id: "portal",
      label: "Artist portal",
      href: `/artists/${track.artist_id}`,
      kind: "portal",
      hint: artistLabel,
    });
  }

  if (track.genre && genreSlug) {
    doors.push({
      id: "genre-live",
      label: `${track.genre} live`,
      href: `/genres/${genreSlug}`,
      kind: "live",
      hint: "Genre charts",
    });
  } else {
    doors.push({
      id: "charts",
      label: "Charts",
      href: "/charts",
      kind: "live",
      hint: "STANDINGS",
    });
  }

  if (
    track.artist_id &&
    artistIsPublic &&
    merchRes.items.length > 0
  ) {
    doors.push({
      id: "merch",
      label: "Merch door",
      href: `/artists/${track.artist_id}`,
      kind: "portal",
      hint: `${merchRes.items.length} item${merchRes.items.length === 1 ? "" : "s"}`,
    });
  }

  const lyrics = parseLyricsText(lyricsRaw, track.duration_secs);

  return NextResponse.json({
    track: {
      id: track.id,
      title: trackTitle(track),
      artist_name: artistLabel,
      artist_id: track.artist_id,
      cover_art_url: track.cover_art_url ?? null,
      genre: track.genre,
      language: track.language ?? null,
      duration_secs: track.duration_secs ?? null,
      audio_url: track.audio_url,
    },
    writers: writersRes.writers.map((w) => ({
      name: w.writer_name,
      percent: w.share_percent,
    })),
    lyrics,
    social: {
      like_count: likeCountRes.count,
      liked: likedRes.likedIds.includes(trackId),
      play_count,
      tips_ready: tipsReady,
      can_tip: Boolean(track.artist_id && artistIsPublic && !isOwner),
    },
    chart,
    fans: friendsLikedRes.likers.map((f) => ({
      id: f.id,
      display_name: f.display_name,
    })),
    doors,
  });
}
