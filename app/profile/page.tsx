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

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/profile");
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const { data: profile } = await supabase
    .from("users")
    .select("display_name, role, countries, genres, account_type")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    profile?.display_name ||
    (typeof meta.display_name === "string" ? meta.display_name : null) ||
    user.email ||
    "User";

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
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/">
            <RectLogo size={34} showWordmark />
          </Link>
          <SignOutButton />
        </div>
      </header>
      <div className="mx-auto max-w-lg space-y-6 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Profile
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {displayName}
          </h1>
          <p className="mt-1 text-sm text-white/40">{user.email}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-xs uppercase tracking-[0.16em] text-white/40">
            Taste
          </h2>
          <p className="mt-3 text-sm text-white/70">
            {genres.length ? genres.join(" · ") : "No genres yet"}
          </p>
          <p className="mt-2 text-sm text-white/50">
            {countries.length ? countries.join(" · ") : "No places yet"}
          </p>
        </div>
        <p className="rounded-2xl border border-dashed border-white/15 px-5 py-6 text-sm text-white/45">
          Your Soundprint — a creative year-in-listening story — will live here.
          Not a copy of Wrapped. Yours.
        </p>
        <Link href="/dashboard" className="inline-block text-sm text-[#1DB954]">
          ← Back to dashboard
        </Link>
      </div>
    </main>
  );
}
