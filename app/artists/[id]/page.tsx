import Link from "next/link";
import { notFound } from "next/navigation";
import { ArtistFollowButton } from "@/components/artist-follow-button";
import { ArtistTipButton } from "@/components/artist-tip-button";
import { RectLogo } from "@/components/rect-logo";
import { TrackList } from "@/components/track-list";
import {
  loadFollowerCount,
  loadIsFollowing,
} from "@/lib/dashboard/follows";
import {
  artistCreditName,
  isProfilePublic,
  PRIVATE_ARTIST_LABEL,
} from "@/lib/dashboard/privacy";
import { tipsTableReady } from "@/lib/dashboard/tips";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isDemoTrack, isPublishedTrack, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ArtistPortalPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const db = admin ?? supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  type ArtistProfile = {
    id: string;
    display_name: string | null;
    genres?: unknown;
    account_type?: string | null;
    role?: string | null;
    city?: string | null;
    artist_bio?: string | null;
    privacy_public_profile?: boolean | null;
  };

  const fullArtist = await db
    .from("users")
    .select(
      "id, display_name, genres, account_type, role, created_at, city, artist_bio, privacy_public_profile",
    )
    .eq("id", id)
    .maybeSingle();

  let artist: ArtistProfile | null = null;
  if (
    fullArtist.error &&
    /privacy_public_profile|city|artist_bio|column .* does not exist/i.test(
      fullArtist.error.message,
    )
  ) {
    const lean = await db
      .from("users")
      .select("id, display_name, genres, account_type, role, created_at")
      .eq("id", id)
      .maybeSingle();
    if (lean.error || !lean.data) notFound();
    artist = lean.data as ArtistProfile;
  } else if (fullArtist.error || !fullArtist.data) {
    notFound();
  } else {
    artist = fullArtist.data as ArtistProfile;
  }

  const isArtist =
    artist.account_type === "artist" || artist.role === "artist";
  if (!isArtist) {
    notFound();
  }

  const isOwner = user?.id === id;
  const publicOk = isProfilePublic({
    privacy_public_profile: artist.privacy_public_profile ?? true,
  });

  if (!publicOk && !isOwner) {
    return (
      <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
        <header className="border-b border-white/10">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
            <Link href="/dashboard">
              <RectLogo size={34} showWordmark />
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-lg px-5 py-20 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Artist portal
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold">
            {PRIVATE_ARTIST_LABEL}
          </h1>
          <p className="mt-3 text-sm text-white/45">
            This artist keeps their profile private.
          </p>
          <Link
            href="/search"
            className="mt-8 inline-block text-sm text-[#1DB954] hover:underline"
          >
            Back to Search
          </Link>
        </div>
      </main>
    );
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

  const name = isOwner
    ? (typeof artist.display_name === "string" &&
        artist.display_name.trim()) ||
      "Artist"
    : artistCreditName({
        display_name: artist.display_name,
        privacy_public_profile: artist.privacy_public_profile ?? true,
      });

  const tracks = ((trackRows ?? []) as TrackRow[])
    .map((t) => ({ ...t, artist_name: name }))
    .filter((t) => {
      if (isDemoTrack(t)) return false;
      // Owners see drafts; public visitors only published
      return isOwner || isPublishedTrack(t);
    });

  const [countRes, followRes, tipsReady] = await Promise.all([
    loadFollowerCount(supabase, id),
    user && !isOwner
      ? loadIsFollowing(supabase, user.id, id)
      : Promise.resolve({ following: false, missingTable: false }),
    tipsTableReady(supabase),
  ]);
  const followsReady = !countRes.missingTable && !followRes.missingTable;

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
            {[
              artist.city?.trim() || null,
              genres.length ? genres.join(" · ") : null,
              !artist.city && !genres.length ? "RECT SOUND artist" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {isOwner && !publicOk ? " · Private to others" : ""}
          </p>
          {artist.artist_bio?.trim() ? (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60">
              {artist.artist_bio.trim()}
            </p>
          ) : null}
          {isOwner ? (
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <p className="text-sm text-white/45">
                {countRes.count.toLocaleString()}{" "}
                {countRes.count === 1 ? "follower" : "followers"}
              </p>
              <Link
                href="/artist"
                className="text-sm text-[#1DB954] hover:underline"
              >
                Open studio →
              </Link>
            </div>
          ) : (
            <div>
              <ArtistFollowButton
                artistId={id}
                initialFollowing={followRes.following}
                initialCount={countRes.count}
                followsReady={followsReady}
              />
              <ArtistTipButton artistId={id} tipsReady={tipsReady} />
            </div>
          )}
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
