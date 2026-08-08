import { redirect } from "next/navigation";
import { PlaylistsClient } from "@/app/playlists/playlists-client";
import { loadUserPlaylists } from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/playlists");
  }

  const result = await loadUserPlaylists(supabase, user.id);

  return (
    <PlaylistsClient
      initialPlaylists={result.playlists}
      loadError={result.error}
      missingTable={result.missingTable}
    />
  );
}
