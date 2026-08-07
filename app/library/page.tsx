import { redirect } from "next/navigation";
import { LibraryClient } from "@/app/library/library-client";
import { loadLikedTracks } from "@/lib/dashboard/likes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/library");
  }

  const result = await loadLikedTracks(supabase, user.id);

  return (
    <LibraryClient
      initialTracks={result.tracks}
      loadError={result.error}
      missingTable={result.missingTable}
    />
  );
}
