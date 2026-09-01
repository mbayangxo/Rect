import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; liveId: string }>;
};

/** RECT Live stage — pro presence; SFU video in a later media pass. */
export default async function RectLiveStagePage({ params }: Props) {
  const { id: artistId, liveId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: row, error } = await supabase
    .from("rect_lives")
    .select(
      "id, artist_id, title, status, visibility, host, portal_release_id, viewer_count, country, city",
    )
    .eq("id", liveId)
    .maybeSingle();

  if (error && /does not exist|PGRST205/i.test(error.message)) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#040d06] px-5 text-center text-white">
        <p className="text-sm text-[#F5A623]">
          Run 20260830_rect_live.sql in Supabase.
        </p>
      </main>
    );
  }
  if (!row || row.artist_id !== artistId) notFound();

  const isHost = Boolean(user && user.id === artistId);
  if (!user && row.status === "live") {
    redirect(
      `/auth/login?next=${encodeURIComponent(`/artists/${artistId}/rect-live/${liveId}`)}`,
    );
  }
  if (row.visibility === "private" && !isHost) notFound();

  const { data: artist } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", artistId)
    .maybeSingle();

  const name =
    (typeof artist?.display_name === "string" && artist.display_name) ||
    "Artist";

  const exitHref =
    row.host === "portal" && row.portal_release_id
      ? `/artists/${artistId}/world/${row.portal_release_id}`
      : `/artists/${artistId}`;

  return (
    <main className="min-h-dvh bg-[#040d06] text-white">
      <header className="flex items-center justify-between px-5 py-4">
        <Link href={exitHref} className="text-sm text-white/55 hover:text-white">
          ← Exit
        </Link>
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#1DB954]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1DB954]" />
          RECT Live
        </span>
      </header>
      <div className="mx-auto max-w-2xl px-5 py-10 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">
          {row.status === "live" ? "On stage" : "Ended"} · {row.host}
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold">
          {row.title}
        </h1>
        <p className="mt-2 text-sm text-white/50">{name}</p>
        <div className="mx-auto mt-10 flex aspect-video max-w-lg items-center justify-center rounded-2xl border border-[#1DB954]/30 bg-[#06140a] px-6">
          <div>
            <p className="text-sm text-white/70">Professional stage</p>
            <p className="mt-2 max-w-xs text-xs text-white/40">
              Session is live in Supabase (title, host World/Portal, visibility).
              Fan video/audio SFU is the next media pass.
            </p>
          </div>
        </div>
        {isHost ? (
          <Link
            href="/studio/rect-live"
            className="mt-8 inline-block rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black"
          >
            Manage / End in Studio
          </Link>
        ) : (
          <Link
            href={exitHref}
            className="mt-8 inline-block text-sm text-[#1DB954] hover:underline"
          >
            Back
          </Link>
        )}
      </div>
    </main>
  );
}
