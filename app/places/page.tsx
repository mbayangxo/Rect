import { PlacesClient } from "@/app/places/places-client";
import { loadListenerTasteWithBehavior } from "@/lib/dashboard/behavior";
import { loadPlaceHubs } from "@/lib/dashboard/places";
import { hasTasteSignal, tasteFromProfile } from "@/lib/dashboard/taste";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PlacesPage() {
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

  const result = await loadPlaceHubs(supabase, taste);

  return (
    <PlacesClient
      hubs={result.hubs}
      loadError={result.error}
      personalized={hasTasteSignal(taste)}
    />
  );
}
