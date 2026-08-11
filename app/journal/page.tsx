import { redirect } from "next/navigation";
import { JournalClient } from "@/app/journal/journal-client";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import {
  loadListeningJournal,
  loadSharedListeningActivity,
} from "@/lib/dashboard/listening-journal";
import { personProfileHref } from "@/lib/dashboard/people";
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
  let activityPrivate = false;

  const { data: profile, error: privacyErr } = await supabase
    .from("users")
    .select("privacy_show_activity, account_type, role")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !privacyErr ||
    !/privacy_show_activity|column .* does not exist/i.test(
      privacyErr.message,
    )
  ) {
    const fromDb = profile?.privacy_show_activity;
    const fromMeta = meta.privacy_show_activity;
    activityPrivate =
      fromDb === false || (fromDb == null && fromMeta === false);
  }

  const isArtist =
    profile?.account_type === "artist" ||
    profile?.role === "artist" ||
    meta.account_type === "artist" ||
    meta.role === "artist";

  const [result, shared] = await Promise.all([
    loadListeningJournal(supabase, user.id),
    activityPrivate
      ? Promise.resolve({
          sharing: false,
          entries: [],
          error: null as string | null,
        })
      : loadSharedListeningActivity(supabase, user.id, 6),
  ]);

  const trackIds = [
    ...new Set(result.entries.map((e) => e.id).filter(Boolean)),
  ];
  const likedAmong = await loadLikedAmongTrackIds(
    supabase,
    user.id,
    trackIds,
  );
  const likedTracks: Record<string, boolean> = {};
  for (const tid of likedAmong.likedIds) {
    likedTracks[tid] = true;
  }

  return (
    <JournalClient
      entries={result.entries}
      loadError={result.error}
      missingTable={result.missingTable}
      activityPrivate={activityPrivate}
      sharedEntries={shared.sharing ? shared.entries : []}
      portalHref={isArtist ? `/artists/${user.id}` : personProfileHref(user.id)}
      likedTracks={likedTracks}
      likesReady={!likedAmong.missingTable}
    />
  );
}
