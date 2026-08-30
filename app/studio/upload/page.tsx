import { StudioUploadForm } from "@/components/studio/studio-upload-form";
import {
  loadStudioPortalProfile,
  requireStudioArtist,
} from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

export default async function StudioUploadPage() {
  const { supabase, userId, displayName } =
    await requireStudioArtist("/studio/upload");
  const portal = await loadStudioPortalProfile(supabase, userId, displayName);
  const needsPlaces = portal.countries.length < 1;

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
        Upload
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        New track
      </h1>
      <p className="mt-2 text-sm text-white/45">
        Audio, cover, and metadata upload to Supabase Storage. Published tracks
        appear on Home and Charts immediately.
      </p>
      <div className="mt-8 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
        <StudioUploadForm displayName={displayName} needsPlaces={needsPlaces} />
      </div>
    </>
  );
}
