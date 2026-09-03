import { StudioTracksList } from "@/components/studio/studio-tracks-list";
import { loadArtistStudioStats } from "@/lib/dashboard/artist-stats";
import { loadWriterSplitsForTracks } from "@/lib/dashboard/writer-splits";
import {
  loadStudioPortalProfile,
  requireStudioArtist,
} from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ focus?: string }>;
};

export default async function StudioTracksPage({ searchParams }: Props) {
  const { focus: focusRaw } = await searchParams;
  const focusTrackId = focusRaw?.trim() || null;

  const { supabase, userId, displayName } =
    await requireStudioArtist("/studio/tracks");
  const [stats, portal] = await Promise.all([
    loadArtistStudioStats(supabase, userId),
    loadStudioPortalProfile(supabase, userId, displayName),
  ]);
  const writers = await loadWriterSplitsForTracks(
    supabase,
    stats.tracks.map((t) => t.id),
  );

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
        My tracks
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Catalog
      </h1>
      <p className="mt-2 text-sm text-white/45">
        {stats.tracks.length} song{stats.tracks.length === 1 ? "" : "s"} ·{" "}
        {stats.publishedCount} published · {stats.draftCount} draft
        {stats.draftCount === 1 ? "" : "s"}
      </p>
      <div className="mt-8">
        <StudioTracksList
          tracks={stats.tracks}
          needsPlaces={portal.countries.length < 1}
          loadError={stats.error}
          focusTrackId={focusTrackId}
          writersByTrack={writers.byTrackId}
        />
      </div>
    </>
  );
}
