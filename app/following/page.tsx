import Link from "next/link";
import { redirect } from "next/navigation";
import { FollowingClient } from "@/app/following/following-client";
import { loadFollowingFeed } from "@/lib/dashboard/follows";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function FollowingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/following");
  }

  const result = await loadFollowingFeed(supabase, user.id);

  return (
    <FollowingClient
      artists={result.artists}
      tracks={result.tracks}
      loadError={result.error}
      missingTable={result.missingTable}
    />
  );
}
