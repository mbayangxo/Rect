import Link from "next/link";
import { BecomeArtistButton } from "@/components/become-artist-button";
import { RectLogo } from "@/components/rect-logo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * RECT Artist entry — separate from RECT Music (consumer listening app).
 * Artists land here, then enter /studio. Fans stay in Music.
 */
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
    <main className="relative min-h-full overflow-x-hidden bg-[#030a05] text-[#f8f8f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(212,175,105,0.14),_transparent_55%)]"
      />
      <div className="relative mx-auto flex min-h-full w-full max-w-lg flex-col px-5 py-10 sm:px-8">
        <header className="mb-14 flex items-center justify-between">
          <Link href="/for-artists" className="flex items-center gap-2">
            <RectLogo size={36} showWordmark={false} />
            <span className="font-[family-name:var(--font-syne)] text-sm font-semibold tracking-wide">
              RECT <span className="text-[var(--rect)]">Artist</span>
            </span>
          </Link>
          <Link
            href={user ? "/dashboard" : "/"}
            className="text-sm text-white/50 hover:text-white"
          >
            RECT Music →
          </Link>
        </header>

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--rect)]">
          RECT Artist
        </p>
        <h1 className="mt-4 font-[family-name:var(--font-syne)] text-4xl font-semibold leading-[1.1] tracking-tight">
          Your catalog. Your world. Your wallet.
        </h1>
        <p className="mt-5 text-base leading-relaxed text-white/55">
          {user && !isArtist
            ? "You’re on RECT Music as a listener. Turn on RECT Artist on this same account — upload, decorate your World, run your store, and get paid via JOKO. This is a separate site from listening."
            : "RECT Artist is a different site from RECT Music. Fans discover on Music — you manage catalog, World, store, and money here. DSP delivery goes through Taali."}
        </p>

        <ul className="mt-8 space-y-3 text-sm text-white/70">
          <li>Upload tracks and schedule New Sounds launches</li>
          <li>Decorate your World and merch store</li>
          <li>Wallet via JOKO · analytics · Wave live rooms</li>
        </ul>

        <div className="mt-12 flex flex-col gap-3">
          {isArtist ? (
            <Link
              href="/studio"
              className="rounded-full bg-[var(--rect)] py-3.5 text-center text-sm font-semibold text-black hover:opacity-90"
            >
              Enter RECT Artist
            </Link>
          ) : user ? (
            <>
              <BecomeArtistButton />
              <p className="text-center text-xs text-white/40">
                Keeps your likes, journal, and follows. Studio tools open after
                upgrade — separate from the Music app drawer.
              </p>
            </>
          ) : (
            <>
              <Link
                href="/auth/signup/artist"
                className="rounded-full bg-[var(--rect)] py-3.5 text-center text-sm font-semibold text-black hover:opacity-90"
              >
                Create RECT Artist account
              </Link>
              <Link
                href="/auth/login?next=/for-artists"
                className="rounded-full border border-white/15 py-3.5 text-center text-sm font-semibold text-white hover:border-[var(--rect)]"
              >
                Log in to upgrade
              </Link>
            </>
          )}
        </div>

        {!user ? (
          <p className="mt-10 text-center text-sm text-white/40">
            Just want to listen?{" "}
            <Link href="/auth/signup" className="text-[var(--rect)] hover:underline">
              Sign up for RECT Music
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
