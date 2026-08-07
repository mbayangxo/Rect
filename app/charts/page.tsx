import Link from "next/link";
import { RectLogo } from "@/components/rect-logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isDemoTrack, trackArtist, trackTitle, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

type ChartTrack = TrackRow & { play_count: number };

function isRealTrack(t: TrackRow) {
  return !isDemoTrack(t);
}

async function loadChartTracks(): Promise<ChartTrack[]> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const db = admin ?? supabase;

  const { data, error } = await db
    .from("tracks")
    .select(
      "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];

  const rows = (data as TrackRow[]).filter(isRealTrack);
  if (rows.length === 0) return [];

  const artistIds = [
    ...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[]),
  ];
  const nameById = new Map<string, string>();
  if (artistIds.length > 0) {
    const { data: artists } = await db
      .from("users")
      .select("id, display_name")
      .in("id", artistIds);
    for (const a of artists ?? []) {
      if (a.display_name) nameById.set(a.id, a.display_name);
    }
  }

  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  const { data: playRows } = await db.from("plays").select("track_id").in("track_id", ids);
  for (const p of playRows ?? []) {
    const tid = p.track_id as string;
    counts.set(tid, (counts.get(tid) ?? 0) + 1);
  }

  return rows
    .map((r) => ({
      ...r,
      artist_name: r.artist_id ? (nameById.get(r.artist_id) ?? null) : null,
      play_count: counts.get(r.id) ?? 0,
    }))
    .sort((a, b) => b.play_count - a.play_count || (b.created_at || "").localeCompare(a.created_at || ""));
}

function ChartList({
  title,
  subtitle,
  tracks,
}: {
  title: string;
  subtitle: string;
  tracks: ChartTrack[];
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <h2 className="font-[family-name:var(--font-syne)] text-xl font-semibold tracking-tight text-[#1DB954] sm:text-2xl">
        {title}
      </h2>
      <p className="mt-1 text-sm text-white/45">{subtitle}</p>
      {tracks.length === 0 ? (
        <p className="mt-8 text-center text-sm text-white/40">
          Charts launching soon
        </p>
      ) : (
        <ol className="mt-6 space-y-3">
          {tracks.map((t, i) => (
            <li
              key={t.id}
              className="flex items-center gap-3 border-b border-white/5 pb-3 last:border-0"
            >
              <span className="w-6 text-sm tabular-nums text-white/35">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{trackTitle(t)}</p>
                <p className="truncate text-xs text-white/40">
                  {trackArtist(t)}
                  {t.genre ? ` · ${t.genre}` : ""}
                </p>
              </div>
              <span className="text-xs tabular-nums text-white/35">
                {t.play_count}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function ChartsPage() {
  const ranked = await loadChartTracks();
  const empty = ranked.length === 0;
  const current = ranked.slice(0, 10);
  const firstLight = [...ranked]
    .sort(
      (a, b) =>
        (a.created_at || "").localeCompare(b.created_at || "") ||
        b.play_count - a.play_count,
    )
    .slice(0, 8);
  const alkebulan = ranked.slice(0, 12);

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-3 text-sm text-white/55">
            <Link href="/" className="hover:text-white">
              Home
            </Link>
            <Link href="/dashboard" className="hover:text-white">
              Dashboard
            </Link>
            <Link href="/charts" className="text-[#1DB954]">
              Charts
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            RECT SOUND Charts
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            What the culture is playing
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            Live boards across RECT SOUND — the pulse of the world.
          </p>
        </div>

        {empty ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-16 text-center">
            <p className="text-lg font-medium">Charts launching soon</p>
            <p className="mt-2 text-sm text-white/40">
              Real plays will fill THE CURRENT, FIRST LIGHT, and THE ALKEBULAN.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <ChartList
              title="THE CURRENT"
              subtitle="Top songs right now"
              tracks={current}
            />
            <ChartList
              title="FIRST LIGHT"
              subtitle="Emerging artists"
              tracks={firstLight}
            />
            <ChartList
              title="THE ALKEBULAN"
              subtitle="Continental pulse"
              tracks={alkebulan}
            />
          </div>
        )}
      </div>
    </main>
  );
}
