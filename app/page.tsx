import Link from "next/link";
import { RectLogo } from "@/components/rect-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { TrackList } from "@/components/track-list";
import { createClient } from "@/lib/supabase/server";
import type { TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

async function loadTracksWithArtists(): Promise<{
  tracks: TrackRow[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .select("id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return { tracks: [], error: error.message };
  }

  const rows = (data ?? []) as TrackRow[];
  const artistIds = [
    ...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[]),
  ];

  const nameById = new Map<string, string>();
  if (artistIds.length > 0) {
    const { data: artists } = await supabase
      .from("users")
      .select("id, display_name")
      .in("id", artistIds);
    for (const a of artists ?? []) {
      if (a.display_name) nameById.set(a.id, a.display_name);
    }
  }

  return {
    tracks: rows.map((r) => ({
      ...r,
      artist_name: r.artist_id
        ? nameById.get(r.artist_id) ?? null
        : "RECT Demo",
    })),
    error: null,
  };
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: {
    display_name?: string | null;
    role?: string | null;
    city?: string | null;
  } | null = null;

  if (user) {
    const full = await supabase
      .from("users")
      .select("display_name, role, city")
      .eq("id", user.id)
      .maybeSingle();
    if (!full.error) {
      profile = full.data;
    } else {
      const minimal = await supabase
        .from("users")
        .select("display_name, role")
        .eq("id", user.id)
        .maybeSingle();
      profile = minimal.data;
    }
  }

  const displayName =
    profile?.display_name ||
    (typeof user?.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : null) ||
    user?.email ||
    null;

  const city =
    profile?.city ||
    (typeof user?.user_metadata?.city === "string"
      ? user.user_metadata.city
      : null);

  const { tracks, error } = await loadTracksWithArtists();
  const empty = !error && tracks.length === 0;

  return (
    <div className="relative bg-[#040d06] text-[#f8f8f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#1DB954]/15 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-[#1DB954]/10 blur-[90px]"
      />

      <div className="relative mx-auto flex w-full max-w-3xl flex-col px-5 pb-28 pt-8 sm:px-6">
        <header className="mb-10 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <RectLogo size={36} />
            <span className="text-sm font-semibold tracking-[0.18em] text-white/80">
              SOUND
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/artist"
              className="hidden text-white/55 transition hover:text-white sm:inline"
            >
              Library
            </Link>
            <Link
              href="/artist/upload"
              className="hidden text-white/55 transition hover:text-white sm:inline"
            >
              Upload
            </Link>
            {user ? (
              <div className="text-right">
                <p className="font-medium text-white">{displayName}</p>
                <p className="text-xs text-white/40">
                  {[profile?.role || user.user_metadata?.role, city]
                    .filter(Boolean)
                    .join(" · ") || user.email}
                </p>
                <div className="mt-1 flex items-center justify-end gap-3">
                  <Link
                    href="/artist"
                    className="text-xs text-[#1DB954] hover:underline sm:hidden"
                  >
                    Library
                  </Link>
                  <Link
                    href="/artist/upload"
                    className="text-xs text-[#1DB954] hover:underline sm:hidden"
                  >
                    Upload
                  </Link>
                  <SignOutButton />
                </div>
              </div>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-white/60 transition hover:text-white"
                >
                  Log in
                </Link>
                <Link
                  href="/auth/signup"
                  className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#17a349]"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </header>

        <section className="mb-12">
          <p className="mb-3 text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
            Pan-African listening
          </p>
          <h1 className="font-display max-w-xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            African Music.
            <br />
            Owned by Africa.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/50">
            {user
              ? `Welcome back${city ? ` · ${city}` : ""}. Press play — every stream hits Supabase.`
              : "Discover tracks from the continent. Sign up to save your taste and count plays."}
          </p>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
              Featured
            </h2>
            <span className="text-xs text-white/30">
              {tracks.length} from Supabase
            </span>
          </div>

          {error ? (
            <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
              Could not load songs. {error}
            </p>
          ) : empty ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-10 text-center">
              <p className="text-sm text-white/55">No songs yet</p>
              <p className="mt-2 text-xs text-white/35">
                <Link href="/artist/upload" className="text-[#1DB954] hover:underline">
                  Upload a track
                </Link>{" "}
                (signed in) or run the seed SQL once.
              </p>
            </div>
          ) : (
            <TrackList tracks={tracks} />
          )}
        </section>
      </div>
    </div>
  );
}
