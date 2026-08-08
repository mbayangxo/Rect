import { redirect } from "next/navigation";
import { ArtistInboxClient } from "@/app/artist/inbox/inbox-client";
import { loadArtistNotifications } from "@/lib/dashboard/notifications";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Listener inbox — release alerts from artists you follow. */
export default async function ListenerInboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/inbox");
  }

  const result = await loadArtistNotifications(supabase, user.id);
  const releases = result.notifications.filter((n) => n.kind === "release");

  return (
    <ArtistInboxClient
      title="Your inbox"
      subtitle="New releases from artists you follow"
      homeHref="/dashboard"
      homeLabel="Home"
      notifications={releases}
      unreadCount={releases.filter((n) => !n.read_at).length}
      loadError={result.error}
      missingTable={result.missingTable}
      emptyHint="Follow artists and they’ll show up here when they publish."
    />
  );
}
