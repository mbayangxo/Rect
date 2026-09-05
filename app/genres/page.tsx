import { GenresClient } from "@/app/genres/genres-client";
import { loadListenerTasteWithBehavior } from "@/lib/dashboard/behavior";
import { loadGenreHubs } from "@/lib/dashboard/genres";
import { hasTasteSignal, tasteFromProfile } from "@/lib/dashboard/taste";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GenresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let taste = tasteFromProfile(null);
  if (user) {
    taste = await loadListenerTasteWithBehavior(
      supabase,
      user.id,
      user.user_metadata as Record<string, unknown>,
    );
  }

  const result = await loadGenreHubs(supabase, taste);

  return (
    <GenresClient
      hubs={result.hubs}
      loadError={result.error}
      personalized={hasTasteSignal(taste)}
    />
  );
}
