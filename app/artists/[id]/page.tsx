import Link from "next/link";
import { notFound } from "next/navigation";
import { RectLogo } from "@/components/rect-logo";
import { TrackList } from "@/components/track-list";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isDemoTrack, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ArtistPortalPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const db = admin ?? supabase;

  const { data: artist, error: artistError } = await db
    .from("users")
    .select("id, display_name, genres, account_type, role, created_at")
    .eq("id", id)
    .maybeSingle();

  if (artistError || !artist) {
    notFound();
  }

  const isArtist =
    artist.account_type === "artist" || artist.role === "artist";
  if (!isArtist) {
    notFound();
  }

  const genres = Array.isArray(artist.genres)
    ? artist.genres.filter((g): g is string => typeof g === "string")
    : [];

  const { data: trackRows, error: trackError } = await db
    .from("tracks")
    .select(
      "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
    )
    .eq("artist_id", id)
    .order("created_at", { ascending: false })
    .limit(40);

  const name =
    (typeof artist.display_name === "string" && artist.display_name.trim()) ||
    "Artist";

  const tracks = ((trackRows ?? []) as TrackRow[])
    .map((t) => ({ ...t, artist_name: name }))
    .filter((t) => !isDemoTrack(t));

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href="/search" className="hover:text-white">
              Search
            </Link>
            <Link href="/charts" className="hover:text-white">
              Charts
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Artist portal
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-5xl">
            {name}
          </h1>
          <p className="mt-2 text-sm text-white/45">
            {genres.length ? genres.join(" · ") : "RECT SOUND artist"}
          </p>
        </div>

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Catalog
          </h2>
          {trackError ? (
            <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
              Could not load tracks. {trackError.message}
            </p>
          ) : tracks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
              <p className="text-base font-medium">No releases yet</p>
              <p className="mt-2 text-sm text-white/40">
                Tracks uploaded by this artist will appear here.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2 md:p-3">
              <TrackList tracks={tracks} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
