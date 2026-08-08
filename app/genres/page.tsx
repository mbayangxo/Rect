import { GenresClient } from "@/app/genres/genres-client";
import { loadGenreHubs } from "@/lib/dashboard/genres";
import {
  hasTasteSignal,
  tasteFromProfile,
} from "@/lib/dashboard/taste";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GenresPage() {
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

  const result = await loadGenreHubs(supabase, taste);

  return (
    <GenresClient
      hubs={result.hubs}
      loadError={result.error}
      personalized={hasTasteSignal(taste)}
    />
  );
}
