import Link from "next/link";
import { redirect } from "next/navigation";
import { CulturalOnboarding } from "@/components/cultural-onboarding";
import { RectLogo } from "@/components/rect-logo";
import { TasteHubLinks } from "@/components/taste-hub-links";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default async function PreferencesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/preferences");
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const { data: profile } = await supabase
    .from("users")
    .select("countries, genres, languages, listening_times")
    .eq("id", user.id)
    .maybeSingle();

  const initial = {
    countries: [
      ...new Set([
        ...asStringArray(profile?.countries),
        ...asStringArray(meta.countries),
      ]),
    ],
    genres: [
      ...new Set([
        ...asStringArray(profile?.genres),
        ...asStringArray(meta.genres),
      ]),
    ],
    languages: [
      ...new Set([
        ...asStringArray(profile?.languages),
        ...asStringArray(meta.languages),
      ]),
    ],
    listening_times: [
      ...new Set([
        ...asStringArray(profile?.listening_times),
        ...asStringArray(meta.listening_times),
      ]),
    ],
  };

  const hasTaste =
    initial.genres.length > 0 ||
    initial.countries.length > 0 ||
    initial.languages.length > 0;

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-3 text-sm text-white/55">
            <Link href="/profile" className="hover:text-white">
              You
            </Link>
            <Link href="/preferences" className="text-[#1DB954]">
              Taste
            </Link>
          </nav>
        </div>
      </header>

      {hasTaste ? (
        <div className="mx-auto w-full max-w-lg border-b border-white/10 px-5 py-8 sm:px-8">
          <TasteHubLinks
            genres={initial.genres}
            countries={initial.countries}
            languages={initial.languages}
          />
          <div className="mt-5 flex flex-wrap gap-4 text-sm">
            <Link href="/genres" className="text-white/45 hover:text-[#1DB954]">
              All genres
            </Link>
            <Link href="/places" className="text-white/45 hover:text-[#1DB954]">
              All places
            </Link>
            <Link
              href="/languages"
              className="text-white/45 hover:text-[#1DB954]"
            >
              All languages
            </Link>
          </div>
        </div>
      ) : null}

      <CulturalOnboarding mode="edit" initial={initial} />
    </main>
  );
}
