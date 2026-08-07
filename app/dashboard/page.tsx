import Link from "next/link";
import { redirect } from "next/navigation";
import { RectLogo } from "@/components/rect-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/dashboard");
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, role, countries, genres, languages, listening_times")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    profile?.display_name ||
    (typeof meta.display_name === "string" ? meta.display_name : null) ||
    user.email ||
    "listener";

  const genres = [
    ...new Set([
      ...asStringArray(profile?.genres),
      ...asStringArray(meta.genres),
    ]),
  ];
  const countries = [
    ...new Set([
      ...asStringArray(profile?.countries),
      ...asStringArray(meta.countries),
    ]),
  ];

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <RectLogo size={34} showWordmark />
          </Link>
          <SignOutButton />
        </div>
      </header>

      <nav className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-3 py-2 sm:px-6">
          {[
            { href: "/", label: "Home" },
            { href: "/search", label: "Search" },
            { href: "/charts", label: "Charts" },
            { href: "/profile", label: "Profile" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm text-white/55 transition hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/dashboard"
            className="rounded-full bg-[#1DB954]/15 px-4 py-2 text-sm font-medium text-[#1DB954]"
            aria-current="page"
          >
            Dashboard
          </Link>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <section>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            RECT SOUND
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome back {displayName}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            Your Soundprint is forming — the culture you chose, waiting to become
            your year in music.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-xs uppercase tracking-[0.16em] text-white/40">
              Your genres
            </h2>
            {genres.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-[#1DB954]/40 bg-[#1DB954]/10 px-3 py-1.5 text-sm text-[#1DB954]"
                  >
                    {g}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/40">
                No genres saved yet. Complete onboarding to personalize.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-xs uppercase tracking-[0.16em] text-white/40">
              Your places
            </h2>
            {countries.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {countries.map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80"
                  >
                    {c}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/40">
                No countries saved yet.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 sm:p-8">
          <h2 className="text-xs uppercase tracking-[0.16em] text-[#1DB954]">
            Music player
          </h2>
          <p className="mt-3 text-lg font-medium tracking-tight">
            Your queue is warming up
          </p>
          <p className="mt-2 max-w-md text-sm text-white/45">
            Playback lives here next — for now, open Home or Charts to find what
            moves you.
          </p>
          <div className="mt-6 flex h-14 items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1DB954] text-sm font-bold text-black">
              ▶
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white/70">Nothing playing</p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-0 bg-[#1DB954]" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
