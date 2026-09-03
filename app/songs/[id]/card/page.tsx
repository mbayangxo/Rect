import Link from "next/link";
import { ListeningCard } from "@/components/listening-card";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPublishedTrack, type TrackRow } from "@/lib/tracks";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function SongListeningCardPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const db = admin ?? supabase;

  const { data, error } = await db
    .from("tracks")
    .select(
      "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();
  const track = data as TrackRow;
  if (!isPublishedTrack(track) && !track.audio_url) notFound();

  let artistName = "Artist";
  let artistAvatar: string | null = null;
  if (track.artist_id) {
    const names = await loadArtistCreditMap(db, [track.artist_id]);
    artistName = names.get(track.artist_id) || artistName;
    const { data: userRow } = await db
      .from("users")
      .select("display_name, avatar_url")
      .eq("id", track.artist_id)
      .maybeSingle();
    if (userRow?.display_name) artistName = String(userRow.display_name);
    if (typeof userRow?.avatar_url === "string") {
      artistAvatar = userRow.avatar_url;
    }
  }

  return (
    <main className="listening-card-page min-h-dvh bg-[#040d06] px-4 py-10 text-[#f8f8f8]">
      <div className="mx-auto mb-6 flex max-w-md items-center justify-between">
        <Link
          href="/dashboard"
          className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--rect-sand)]"
        >
          RECT SOUND
        </Link>
        <Link
          href={`/songs/${track.id}`}
          className="text-xs text-white/40 hover:text-white"
        >
          Song page
        </Link>
      </div>
      <ListeningCard
        track={track}
        artistName={artistName}
        artistAvatarUrl={artistAvatar}
      />
    </main>
  );
}
