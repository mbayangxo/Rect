import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackCover } from "@/components/track-cover";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackTitle, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const DSP_LABELS: Record<string, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube_music: "YouTube Music",
  deezer: "Deezer",
  tidal: "Tidal",
  amazon_music: "Amazon Music",
  boomplay: "Boomplay",
};

export default async function ReleaseSmartLinkPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const db = admin ?? supabase;

  const { data: release } = await db
    .from("distribution_releases")
    .select(
      "id, title, cover_art_url, status, smart_link_slug, store_links, artist_id, release_date",
    )
    .eq("smart_link_slug", slug)
    .maybeSingle();

  if (!release) notFound();

  // Public page: only show DSP store links when Taali marked live
  const live = release.status === "live";
  const storeLinks =
    live &&
    release.store_links &&
    typeof release.store_links === "object" &&
    !Array.isArray(release.store_links)
      ? (release.store_links as Record<string, string>)
      : {};

  const { data: links } = await db
    .from("distribution_release_tracks")
    .select("track_id, track_number")
    .eq("release_id", release.id)
    .order("track_number", { ascending: true });

  const trackIds = (links ?? []).map((l) => String(l.track_id));
  let tracks: TrackRow[] = [];
  if (trackIds.length > 0) {
    const { data } = await db
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, status, created_at",
      )
      .in("id", trackIds);
    const byId = new Map(((data ?? []) as TrackRow[]).map((t) => [t.id, t]));
    tracks = trackIds.map((id) => byId.get(id)).filter(Boolean) as TrackRow[];
  }

  const artistHref = release.artist_id
    ? `/artists/${release.artist_id}`
    : "/discover";

  return (
    <main className="min-h-dvh bg-[#040d06] pb-24 text-[#f8f8f8]">
      <div className="mx-auto flex w-full max-w-lg flex-col px-5 py-12 sm:px-8">
        {release.cover_art_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={release.cover_art_url}
            alt=""
            className="mx-auto aspect-square w-full max-w-xs rounded-2xl object-cover"
          />
        ) : tracks[0] ? (
          <div className="mx-auto">
            <TrackCover track={tracks[0]} size="lg" />
          </div>
        ) : null}

        <h1 className="mt-8 text-center font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight">
          {release.title}
        </h1>
        <p className="mt-2 text-center text-sm text-white/45">
          {live
            ? "Listen on RECT or your DSP"
            : "Listen on RECT — DSP links appear when Taali confirms delivery"}
        </p>

        <Link
          href={artistHref}
          className="mt-8 block w-full rounded-full bg-[#1DB954] py-3.5 text-center text-sm font-semibold text-black"
        >
          Open on RECT
        </Link>

        {tracks.length > 0 ? (
          <ul className="mt-6 space-y-2">
            {tracks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/songs/${t.id}`}
                  className="block rounded-xl border border-white/10 px-4 py-3 text-sm hover:border-[#1DB954]/40"
                >
                  {trackTitle(t)}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {Object.keys(storeLinks).length > 0 ? (
          <div className="mt-8 space-y-2">
            <p className="text-center text-xs uppercase tracking-wider text-white/35">
              Also on
            </p>
            {Object.entries(storeLinks).map(([key, url]) => (
              <a
                key={key}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-full border border-white/15 py-3 text-center text-sm font-medium text-white/80 hover:border-[#1DB954]/50"
              >
                {DSP_LABELS[key] || key}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
