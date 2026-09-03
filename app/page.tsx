import Link from "next/link";
import { RectLogo } from "@/components/rect-logo";
import { SignOutButton } from "@/components/sign-out-button";
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
    <section className="w-full space-y-10">
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          On RECT now
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
                href="/radio"
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white/70 hover:border-[#1DB954]/50 hover:text-white"
              >
                Open Wave
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
              href="/charts"
              className="text-xs text-[#1DB954] hover:underline"
            >
              Standings →
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
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(29,185,84,0.18),transparent_55%),radial-gradient(ellipse_at_90%_20%,rgba(29,185,84,0.08),transparent_40%),linear-gradient(180deg,#06140a_0%,#040d06_45%,#030a05_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
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
                  Standings
                </Link>
                <Link
                  href="/radio"
                  className="hidden text-white/70 transition hover:text-white sm:inline"
                >
                  Wave
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
            <p className="font-display text-5xl font-semibold tracking-tight text-[#1DB954]">
              RECT
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold leading-[1.1] tracking-tight">
              A world of music.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">
              Listen with intention. Support artists directly. Charts, portals,
              and culture — connected.
            </p>
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
            ) : (
              <div className="mt-8 flex flex-col gap-3">
                <Link
                  href="/dashboard"
                  className="rounded-full bg-[#1DB954] py-3 text-center text-sm font-semibold text-black hover:bg-[#17a349]"
                >
                  Enter Hearth
                </Link>
                <div className="flex gap-3">
                  <Link
                    href="/radio"
                    className="flex-1 rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-white hover:border-[#1DB954]"
                  >
                    Wave
                  </Link>
                  <Link
                    href="/charts"
                    className="flex-1 rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-white hover:border-[#1DB954]"
                  >
                    Standings
                  </Link>
                </div>
                {profile?.role === "artist" ? (
                  <Link
                    href="/studio"
                    className="pt-1 text-center text-xs text-white/40 hover:text-white/70"
                  >
                    Artist studio →
                  </Link>
                ) : null}
              </div>
            )}
          </section>
          <FeaturedPanel tracks={tracks} playlists={playlists} error={error} />
        </div>

        <div className="hidden md:grid md:grid-cols-2 md:items-start md:gap-14 lg:gap-20">
          <section className="pt-4">
            <p className="font-display text-7xl font-semibold tracking-tight text-[#1DB954] lg:text-8xl">
              RECT
            </p>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05] tracking-tight lg:text-5xl">
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
            ) : (
              <div className="mt-10 flex flex-col items-start gap-3">
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/dashboard"
                    className="rounded-full bg-[#1DB954] px-7 py-3 text-sm font-semibold text-black hover:bg-[#17a349]"
                  >
                    Enter Hearth
                  </Link>
                  <Link
                    href="/radio"
                    className="rounded-full border border-white/15 px-7 py-3 text-sm font-semibold text-white hover:border-[#1DB954]"
                  >
                    Wave
                  </Link>
                  <Link
                    href="/charts"
                    className="rounded-full border border-white/15 px-7 py-3 text-sm font-semibold text-white hover:border-[#1DB954]"
                  >
                    Standings
                  </Link>
                </div>
                {profile?.role === "artist" ? (
                  <Link
                    href="/studio"
                    className="text-xs text-white/40 hover:text-white/70"
                  >
                    Artist studio →
                  </Link>
                ) : null}
              </div>
            )}
          </section>

          <FeaturedPanel tracks={tracks} playlists={playlists} error={error} />
        </div>
      </div>
    </div>
  );
}
