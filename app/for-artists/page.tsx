import Link from "next/link";
import { BecomeArtistButton } from "@/components/become-artist-button";
import { RectLogo } from "@/components/rect-logo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ForArtistsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isArtist = false;
  if (user) {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const { data: profile } = await supabase
      .from("users")
      .select("role, account_type")
      .eq("id", user.id)
      .maybeSingle();
    isArtist =
      profile?.account_type === "artist" ||
      profile?.role === "artist" ||
      meta.account_type === "artist" ||
      meta.role === "artist";
  }

  return (
    <main className="relative min-h-full overflow-x-hidden bg-[#040d06] text-[#f8f8f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#1DB954]/15 blur-[100px]"
      />
      <div className="relative mx-auto flex min-h-full w-full max-w-lg flex-col px-5 py-10 sm:px-8">
        <header className="mb-14 flex items-center justify-between">
          <Link href="/">
            <RectLogo size={36} showWordmark />
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              className="text-sm text-white/60 hover:text-white"
            >
              Hub
            </Link>
          ) : (
            <Link
              href="/auth/login?next=/for-artists"
              className="text-sm text-white/60 hover:text-white"
            >
              Log in
            </Link>
          )}
        </header>

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1DB954]">
          For artists
        </p>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.1] tracking-tight">
          Upload. Reach Africa. Grow with listeners.
        </h1>
        <p className="mt-5 text-base leading-relaxed text-white/55">
          {user && !isArtist
            ? "You’re already on RECT as a listener. Turn on Studio on this same account — no new signup. Tips and play earnings are demo ledgers today, not withdrawable payouts yet."
            : "RECT for artists lives alongside listening. Fans discover music on the main app — you manage your catalog in Studio. Tips and play earnings are demo ledgers today, not withdrawable payouts yet."}
        </p>

        <ul className="mt-8 space-y-3 text-sm text-white/70">
          <li>Upload tracks and cover art</li>
          <li>See plays on your releases</li>
          <li>Receive demo tips from fans (not real cash yet)</li>
        </ul>

        <div className="mt-12 flex flex-col gap-3">
          {isArtist ? (
            <Link
              href="/studio/upload"
              className="rounded-full bg-[#1DB954] py-3.5 text-center text-sm font-semibold text-black hover:bg-[#17a349]"
            >
              Open Artist OS
            </Link>
          ) : user ? (
            <>
              <BecomeArtistButton />
              <p className="text-center text-xs text-white/40">
                Keeps your likes, journal, and follows on this account. Upload
                from Studio — TAALI registration is optional later.
              </p>
            </>
          ) : (
            <>
              <Link
                href="/auth/signup/artist"
                className="rounded-full bg-[#1DB954] py-3.5 text-center text-sm font-semibold text-black hover:bg-[#17a349]"
              >
                Create artist account
              </Link>
              <Link
                href="/auth/login?next=/for-artists"
                className="rounded-full border border-white/15 py-3.5 text-center text-sm font-semibold text-white hover:border-[#1DB954]"
              >
                Log in to upgrade
              </Link>
            </>
          )}
        </div>

        {!user ? (
          <p className="mt-10 text-center text-sm text-white/40">
            Just want to listen?{" "}
            <Link
              href="/auth/signup"
              className="text-[#1DB954] hover:underline"
            >
              Sign up as a fan
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
