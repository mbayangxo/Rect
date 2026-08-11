import { redirect } from "next/navigation";
import { LibraryClient } from "@/app/library/library-client";
import { loadLikedTracks } from "@/lib/dashboard/likes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/library");
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  let likesHidden = true; // default off — matches Profile copy

  const { data: privacyRow, error: privacyErr } = await supabase
    .from("users")
    .select("privacy_show_likes")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !privacyErr ||
    !/privacy_show_likes|column .* does not exist/i.test(privacyErr.message)
  ) {
    const fromDb = privacyRow?.privacy_show_likes;
    const fromMeta = meta.privacy_show_likes;
    likesHidden =
      fromDb !== true && !(fromDb == null && fromMeta === true);
  }

  const result = await loadLikedTracks(supabase, user.id);

  return (
    <LibraryClient
      initialTracks={result.tracks}
      loadError={result.error}
      missingTable={result.missingTable}
      likesHidden={likesHidden}
    />
  );
}
