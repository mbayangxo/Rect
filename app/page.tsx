import Link from "next/link";
import { redirect } from "next/navigation";
import { RectLogo } from "@/components/rect-logo";
import { TrackList } from "@/components/track-list";
import { searchCatalog, type SearchPlaylist } from "@/lib/dashboard/search";
import { loadFeaturedTracks } from "@/lib/dashboard/tracks";
import { createClient } from "@/lib/supabase/server";
import type { TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

function FeaturedPanel({
  tracks,
  playlists,
  error,
}: {
  tracks: TrackRow[];
  playlists: SearchPlaylist[];
  error: string | null;
}) {
  const hasTracks = tracks.length > 0;
  const hasMixes = playlists.length > 0;

  return (
    <section className="w-full space-y-8">
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          Featured
        </h2>

        {error ? (
          <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
            Could not load songs. {error}
          </p>
        ) : hasTracks ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 md:p-3">
            <TrackList tracks={tracks} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-10 text-center">
            <p className="text-sm text-white/55">No published tracks yet</p>
            <p className="mt-1 text-xs text-white/35">
              When artists release on RECT, the first listens land here.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                href="/search"
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white/70 hover:border-[#1DB954]/50 hover:text-white"
              >
                Browse Search
              </Link>
              <Link
                href="/auth/signup"
                className="rounded-full bg-[#1DB954] px-4 py-2 text-xs font-semibold text-black hover:bg-[#17a349]"
              >
                Join free
              </Link>
            </div>
          </div>
        )}
      </div>

      {hasMixes ? (
        <div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
              Public mixes
            </h2>
            <Link
              href="/search"
              className="text-xs text-[#1DB954] hover:underline"
            >
              Find more →
            </Link>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {playlists.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/playlists/${p.id}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-[#1DB954]/40"
                >
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                    {p.cover_art_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.cover_art_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-white/25">
                        ♫
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {p.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-white/40">
                      {p.track_count}{" "}
                      {p.track_count === 1 ? "track" : "tracks"}
                      {p.owner_name ? ` · ${p.owner_name}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const [featured, catalog] = await Promise.all([
    loadFeaturedTracks(supabase),
    searchCatalog(supabase, ""),
  ]);

  const tracks = (featured.ok ? featured.tracks : [])
    .filter((t) => Boolean(t.audio_url))
    .slice(0, 8);
  const playlists = catalog.playlists.slice(0, 6);
  const error = featured.ok ? null : featured.error;

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
          </section>
          <FeaturedPanel tracks={tracks} playlists={playlists} error={error} />
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
          </section>

          <FeaturedPanel tracks={tracks} playlists={playlists} error={error} />
        </div>
      </div>
    </div>
  );
}
