import { StudioShell } from "@/components/studio/studio-shell";
import { loadOwnedLabel } from "@/lib/dashboard/rect-labels";
import {
  loadStudioPortalProfile,
  requireStudioArtist,
} from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, userId, displayName } = await requireStudioArtist("/studio");
  await loadStudioPortalProfile(supabase, userId, displayName);
  const owned = await loadOwnedLabel(supabase, userId);

  return (
    <StudioShell displayName={displayName} ownsLabel={Boolean(owned.label)}>
      {children}
    </StudioShell>
  );
}
