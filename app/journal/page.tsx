import { redirect } from "next/navigation";
import { JournalClient } from "@/app/journal/journal-client";
import { loadListeningJournal } from "@/lib/dashboard/listening-journal";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/journal");
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const { data: profile } = await supabase
    .from("users")
    .select("privacy_show_activity")
    .eq("id", user.id)
    .maybeSingle();

  const activityPrivate =
    profile?.privacy_show_activity === false ||
    meta.privacy_show_activity === false;

  const result = await loadListeningJournal(supabase, user.id);

  return (
    <JournalClient
      entries={result.entries}
      loadError={result.error}
      missingTable={result.missingTable}
      activityPrivate={activityPrivate}
    />
  );
}
