import { RadioClient } from "@/app/radio/radio-client";
import { loadRadioStations } from "@/lib/dashboard/radio";
import {
  hasTasteSignal,
  tasteFromProfile,
} from "@/lib/dashboard/taste";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RadioPage() {
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

  const result = await loadRadioStations(supabase, taste);

  return (
    <RadioClient
      stations={result.stations}
      loadError={result.error}
      personalized={hasTasteSignal(taste)}
    />
  );
}
