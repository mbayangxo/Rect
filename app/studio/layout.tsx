import { StudioShell } from "@/components/studio/studio-shell";
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

  return <StudioShell displayName={displayName}>{children}</StudioShell>;
}
