import Link from "next/link";
import { RectLogo } from "@/components/rect-logo";

export default function ForArtistsPage() {
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
          <Link
            href="/auth/login?next=/artist"
            className="text-sm text-white/60 hover:text-white"
          >
            Log in
          </Link>
        </header>

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1DB954]">
          For artists
        </p>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.1] tracking-tight">
          Upload. Reach Africa. Get paid fairly.
        </h1>
        <p className="mt-5 text-base leading-relaxed text-white/55">
          RECT for artists is separate from listening. Fans discover music on
          the main app — you manage your catalog here.
        </p>

        <ul className="mt-8 space-y-3 text-sm text-white/70">
          <li>Upload tracks and cover art</li>
          <li>See plays on your releases</li>
          <li>Reach listeners across the continent</li>
        </ul>

        <div className="mt-12 flex flex-col gap-3">
          <Link
            href="/auth/signup/artist"
            className="rounded-full bg-[#1DB954] py-3.5 text-center text-sm font-semibold text-black hover:bg-[#17a349]"
          >
            Create artist account
          </Link>
          <Link
            href="/auth/login?next=/artist"
            className="rounded-full border border-white/15 py-3.5 text-center text-sm font-semibold text-white hover:border-[#1DB954]"
          >
            Artist log in
          </Link>
        </div>

        <p className="mt-10 text-center text-sm text-white/40">
          Just want to listen?{" "}
          <Link href="/auth/signup" className="text-[#1DB954] hover:underline">
            Sign up as a fan
          </Link>
        </p>
      </div>
    </main>
  );
}
