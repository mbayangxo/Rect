import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackPlayButton } from "@/components/track-play-button";
import { createClient } from "@/lib/supabase/server";
import { trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function SongPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tracks")
    .select("id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();

  let artist_name: string | null = null;
  if (data.artist_id) {
    const { data: artist } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", data.artist_id)
      .maybeSingle();
    artist_name = artist?.display_name ?? null;
  } else {
    artist_name = "RECT Demo";
  }

  const track: TrackRow = { ...data, artist_name };

  return (
    <main className="min-h-screen bg-[#040d06] px-5 py-10 text-[#f8f8f8] sm:px-6">
      <div className="mx-auto max-w-xl">
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.2em] text-white/45 hover:text-white"
        >
          ← Home
        </Link>

        <div className="mt-10 rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
          <p className="text-[0.65rem] uppercase tracking-[0.28em] text-[#1DB954]">
            Track
          </p>
          <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight">
            {trackTitle(track)}
          </h1>
          <p className="mt-2 text-sm text-white/50">
            {trackArtist(track)}
            {track.genre ? ` · ${track.genre}` : ""}
          </p>

          <div className="mt-8">
            <TrackPlayButton track={track} />
          </div>

          {!track.audio_url ? (
            <p className="mt-4 text-sm text-red-200">No audio_url on this row.</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
