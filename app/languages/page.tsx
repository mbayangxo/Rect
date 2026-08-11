import { LanguagesClient } from "@/app/languages/languages-client";
import { loadLanguageHubs } from "@/lib/dashboard/languages";
import {
  hasTasteSignal,
  loadListenerTaste,
  tasteFromProfile,
} from "@/lib/dashboard/taste";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LanguagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let taste = tasteFromProfile(null);
  if (user) {
    taste = await loadListenerTaste(
      supabase,
      user.id,
      user.user_metadata as Record<string, unknown>,
    );
  }

  const result = await loadLanguageHubs(supabase, taste);

  return (
    <LanguagesClient
      hubs={result.hubs}
      loadError={result.error}
      personalized={hasTasteSignal(taste)}
    />
  );
}
