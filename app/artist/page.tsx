import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { trackTitle, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

type ArtistTrack = TrackRow & { play_count: number };

async function loadArtistTracks(userId: string): Promise<{
  tracks: ArtistTrack[];
  error: string | null;
}> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const db = admin ?? supabase;

  const { data, error } = await db
    .from("tracks")
    .select(
      "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
    )
    .eq("artist_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return { tracks: [], error: error.message };
  }

  const rows = (data ?? []) as TrackRow[];
  if (rows.length === 0) {
    return { tracks: [], error: null };
  }

  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();

  const { data: playRows, error: playError } = await db
    .from("plays")
    .select("track_id")
    .in("track_id", ids);

  if (!playError && playRows) {
    for (const p of playRows) {
      const tid = p.track_id as string;
      counts.set(tid, (counts.get(tid) ?? 0) + 1);
    }
  }

  return {
    tracks: rows.map((r) => ({
      ...r,
      play_count: counts.get(r.id) ?? 0,
    })),
    error: null,
  };
}

export default async function ArtistLibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/artist");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, role, city")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    profile?.display_name ||
    (typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : null) ||
    user.email;

  const { tracks, error } = await loadArtistTracks(user.id);
  const totalPlays = tracks.reduce((sum, t) => sum + t.play_count, 0);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040d06] text-[#f8f8f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#1DB954]/12 blur-[100px]"
      />

      <div className="relative mx-auto w-full max-w-3xl px-5 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="text-xs uppercase tracking-[0.2em] text-white/45 hover:text-white"
          >
            ← Home
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/artist/upload"
              className="rounded-full bg-[#1DB954] px-4 py-2 font-semibold text-black hover:bg-[#17a349]"
            >
              Upload
            </Link>
          </div>
        </div>

        <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
          Artist portal
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Your library
        </h1>
        <p className="mt-2 text-sm text-white/50">
          {displayName}
          {profile?.city ? ` · ${profile.city}` : ""} — tracks and plays from
          Supabase.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10">
          <div className="bg-[#071208] px-4 py-4 text-center">
            <p className="font-display text-2xl text-[#1DB954]">{tracks.length}</p>
            <p className="mt-1 text-[0.55rem] uppercase tracking-[0.16em] text-white/40">
              Tracks
            </p>
          </div>
          <div className="bg-[#071208] px-4 py-4 text-center">
            <p className="font-display text-2xl text-[#1DB954]">{totalPlays}</p>
            <p className="mt-1 text-[0.55rem] uppercase tracking-[0.16em] text-white/40">
              Plays
            </p>
          </div>
          <div className="bg-[#071208] px-4 py-4 text-center">
            <p className="font-display text-2xl text-[#1DB954]">
              {profile?.role || user.user_metadata?.role || "artist"}
            </p>
            <p className="mt-1 text-[0.55rem] uppercase tracking-[0.16em] text-white/40">
              Role
            </p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
            Uploaded tracks
          </h2>

          {error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : tracks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 px-4 py-10 text-center">
              <p className="text-sm text-white/55">No uploads yet</p>
              <Link
                href="/artist/upload"
                className="mt-3 inline-block text-sm text-[#1DB954] hover:underline"
              >
                Upload your first track →
              </Link>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
              {tracks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/songs/${t.id}`}
                      className="block truncate text-sm font-medium text-white hover:underline"
                    >
                      {trackTitle(t)}
                    </Link>
                    <p className="mt-1 truncate text-xs text-white/40">
                      {t.genre || "no genre"}
                      {t.status ? ` · ${t.status}` : ""}
                      {t.audio_url ? " · audio ok" : " · missing audio"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-lg text-[#1DB954]">
                      {t.play_count}
                    </p>
                    <p className="text-[0.55rem] uppercase tracking-[0.14em] text-white/35">
                      plays
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
