import Link from "next/link";
import { RectLogo } from "@/components/rect-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { TrackList } from "@/components/track-list";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { createClient } from "@/lib/supabase/server";
import { isDemoTrack, isPublishedTrack, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

async function loadTracksWithArtists(): Promise<{
  tracks: TrackRow[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .select(
      "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    return { tracks: [], error: error.message };
  }

  const rows = (data ?? []) as TrackRow[];
  const artistIds = [
    ...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[]),
  ];

  const nameById = await loadArtistCreditMap(supabase, artistIds);

  const tracks = rows
    .map((r) => ({
      ...r,
      artist_name: r.artist_id
        ? (nameById.get(r.artist_id) ?? null)
        : null,
    }))
    .filter((t) => isPublishedTrack(t) && !isDemoTrack(t))
    .slice(0, 20);

  return { tracks, error: null };
}

function FeaturedPanel({
  tracks,
  error,
  empty,
}: {
  tracks: TrackRow[];
  error: string | null;
  empty: boolean;
}) {
  return (
    <section className="w-full">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
        Featured
      </h2>

      {error ? (
        <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
          Could not load songs. {error}
        </p>
      ) : empty ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-10 text-center">
          <p className="text-sm text-white/55">Coming soon</p>
          <p className="mt-1 text-xs text-white/35">
            Real releases will land here.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 md:p-3">
          <TrackList tracks={tracks} />
        </div>
      )}
    </section>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: {
    display_name?: string | null;
    role?: string | null;
  } | null = null;

  if (user) {
    const full = await supabase
      .from("users")
      .select("display_name, role")
      .eq("id", user.id)
      .maybeSingle();
    profile = full.data;
  }

  const displayName =
    profile?.display_name ||
    (typeof user?.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : null) ||
    user?.email ||
    null;

  const { tracks, error } = await loadTracksWithArtists();
  const empty = !error && tracks.length === 0;

  return (
    <div className="relative min-h-full overflow-x-hidden bg-[#040d06] text-[#f8f8f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#1DB954]/15 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-[#1DB954]/10 blur-[90px]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 pb-36 pt-8 sm:px-8 lg:px-10">
        <header className="mb-10 flex items-center justify-between gap-4 md:mb-14">
          <Link href="/" className="flex items-center gap-3">
            <RectLogo size={36} showWordmark />
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/charts"
                  className="hidden text-white/70 transition hover:text-white sm:inline"
                >
                  Charts
                </Link>
                <Link
                  href="/dashboard"
                  className="text-white/70 transition hover:text-white"
                >
                  {displayName}
                </Link>
                <SignOutButton />
              </div>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-white/70 transition hover:text-white"
                >
                  Log In
                </Link>
                <Link
                  href="/auth/signup"
                  className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#17a349]"
                >
                  Sign Up
                </Link>
              </>
            )}
          </nav>
        </header>

        <div className="md:hidden">
          <section className="mb-10">
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
              A world of music.
            </h1>
            <ul className="mt-6 space-y-2 text-sm text-white/55">
              <li>Listen inside a curated sonic world</li>
              <li>Support artists directly</li>
              <li>Charts, portals, and culture — connected</li>
            </ul>
            {!user ? (
              <div className="mt-8 flex flex-col gap-3">
                <Link
                  href="/auth/signup"
                  className="rounded-full bg-[#1DB954] py-3 text-center text-sm font-semibold text-black hover:bg-[#17a349]"
                >
                  Sign up free
                </Link>
                <Link
                  href="/auth/login"
                  className="rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-white hover:border-[#1DB954]"
                >
                  Log in
                </Link>
                <Link
                  href="/for-artists"
                  className="pt-1 text-center text-xs text-white/40 hover:text-white/70"
                >
                  Are you an artist?
                </Link>
              </div>
            ) : profile?.role === "artist" ? (
              <Link
                href="/artist"
                className="mt-8 block rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-white hover:border-[#1DB954]"
              >
                Artist library
              </Link>
            ) : null}
          </section>
          <FeaturedPanel tracks={tracks} error={error} empty={empty} />
        </div>

        <div className="hidden md:grid md:grid-cols-2 md:items-start md:gap-14 lg:gap-20">
          <section className="pt-4">
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight lg:text-6xl">
              A world of music.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/55">
              Not a feed. A world — where listening, artists, and culture meet
              with intention.
            </p>
            {!user ? (
              <div className="mt-10 flex flex-col items-start gap-3">
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/auth/signup"
                    className="rounded-full bg-[#1DB954] px-7 py-3 text-sm font-semibold text-black hover:bg-[#17a349]"
                  >
                    Sign up free
                  </Link>
                  <Link
                    href="/auth/login"
                    className="rounded-full border border-white/15 px-7 py-3 text-sm font-semibold text-white hover:border-[#1DB954]"
                  >
                    Log in
                  </Link>
                </div>
                <Link
                  href="/for-artists"
                  className="text-xs text-white/40 hover:text-white/70"
                >
                  Are you an artist? Upload on RECT for Artists →
                </Link>
              </div>
            ) : profile?.role === "artist" ? (
              <Link
                href="/artist"
                className="mt-10 inline-block rounded-full border border-white/15 px-7 py-3 text-sm font-semibold text-white hover:border-[#1DB954]"
              >
                Artist library
              </Link>
            ) : null}
          </section>

          <FeaturedPanel tracks={tracks} error={error} empty={empty} />
        </div>
      </div>
    </div>
  );
}
