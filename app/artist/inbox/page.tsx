import { redirect } from "next/navigation";
import { ArtistInboxClient } from "@/app/artist/inbox/inbox-client";
import { loadArtistNotifications } from "@/lib/dashboard/notifications";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ArtistInboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/artist/inbox");
  }

  const result = await loadArtistNotifications(supabase, user.id);
  const studio = result.notifications.filter(
    (n) => n.kind === "follow" || n.kind === "tip",
  );

  return (
    <ArtistInboxClient
      title="Activity"
      subtitle="Follows and tips"
      homeHref="/artist"
      homeLabel="Studio"
      notifications={studio}
      unreadCount={studio.filter((n) => !n.read_at).length}
      loadError={result.error}
      missingTable={result.missingTable}
      emptyHint="New follows and tips will show up here."
    />
  );
}
