import Link from "next/link";
import { redirect } from "next/navigation";
import { RectLogo } from "@/components/rect-logo";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { createClient } from "@/lib/supabase/server";
import { readRectOsSurface } from "@/lib/studio/surface";

export const dynamic = "force-dynamic";

export default async function ArtistOsHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const surface = await readRectOsSurface();

  if (user && surface === "artist") {
    const { data: profile } = await supabase
      .from("users")
      .select("role, account_type")
      .eq("id", user.id)
      .maybeSingle();
    if (isArtistAccount(profile, user)) {
      redirect("/studio");
    }
  }

  const listeningOnSound = Boolean(user && surface !== "artist");

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-[#040d06] text-[#f8f8f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#1DB954]/15 blur-[100px]"
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 py-10 sm:px-8">
        <header className="mb-14 flex items-center justify-between">
          <Link href="/artist" className="flex items-center gap-3">
            <RectLogo size={36} showWordmark />
          </Link>
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[#1DB954]">
            Artist OS
          </span>
        </header>

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1DB954]">
          RECT SOUND / artist
        </p>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.1] tracking-tight">
          Artist OS is its own login.
        </h1>
        <p className="mt-5 text-base leading-relaxed text-white/55">
          This is not your RECT SOUND listener account. Upload, store, analytics,
          and your public portal live here. Listeners stay on RECT SOUND. You can
          connect the two accounts later if you want.
        </p>

        {listeningOnSound ? (
          <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
            You’re signed into RECT SOUND as a listener. Artist OS needs a
            separate artist login.
          </p>
        ) : null}

        <ul className="mt-8 space-y-3 text-sm text-white/70">
          <li>Separate artist email and password</li>
          <li>Upload tracks and merch</li>
          <li>Optional: connect to your listener from Profile</li>
        </ul>

        <div className="mt-12 flex flex-col gap-3">
          <Link
            href="/artist/login"
            className="rounded-full bg-[#1DB954] py-3.5 text-center text-sm font-semibold text-black hover:bg-[#17a349]"
          >
            Log in to Artist OS
          </Link>
          <Link
            href="/artist/signup"
            className="rounded-full border border-white/15 py-3.5 text-center text-sm font-semibold text-white hover:border-[#1DB954]"
          >
            Create artist account
          </Link>
        </div>

        <p className="mt-10 text-center text-sm text-white/40">
          Just listening?{" "}
          <Link href="/auth/login" className="text-[#1DB954] hover:underline">
            RECT SOUND login
          </Link>
        </p>
      </div>
    </main>
  );
}
