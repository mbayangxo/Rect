import Link from "next/link";
import { redirect } from "next/navigation";
import { CulturalOnboarding } from "@/components/cultural-onboarding";
import { RectLogo } from "@/components/rect-logo";
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
      <CulturalOnboarding mode="edit" initial={initial} />
    </main>
  );
}
