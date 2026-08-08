import { NewReleasesClient } from "@/app/new/new-releases-client";
import { loadNewReleases } from "@/lib/dashboard/new-releases";
import {
  hasTasteSignal,
  tasteFromProfile,
} from "@/lib/dashboard/taste";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewReleasesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let taste = tasteFromProfile(null);
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("countries, genres")
      .eq("id", user.id)
      .maybeSingle();
    taste = tasteFromProfile(profile);
  }

  const result = await loadNewReleases(supabase, 30, taste);

  return (
    <NewReleasesClient
      tracks={result.tracks}
      loadError={result.error}
      personalized={hasTasteSignal(taste)}
    />
  );
}
