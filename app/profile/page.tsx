import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileSettings } from "@/components/profile-settings";
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

function asBool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
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
  let profile: {
    display_name?: string | null;
    countries?: unknown;
    genres?: unknown;
    privacy_public_profile?: boolean | null;
    privacy_show_activity?: boolean | null;
    privacy_show_on_charts?: boolean | null;
  } | null = null;

  const full = await supabase
    .from("users")
    .select(
      "display_name, role, countries, genres, account_type, privacy_public_profile, privacy_show_activity, privacy_show_on_charts",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (full.error) {
    const lean = await supabase
      .from("users")
      .select("display_name, role, countries, genres, account_type")
      .eq("id", user.id)
      .maybeSingle();
    profile = lean.data;
  } else {
    profile = full.data;
  }

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

  const privacy = {
    privacy_public_profile: asBool(
      profile?.privacy_public_profile ?? meta.privacy_public_profile,
      true,
    ),
    privacy_show_activity: asBool(
      profile?.privacy_show_activity ?? meta.privacy_show_activity,
      true,
    ),
    privacy_show_on_charts: asBool(
      profile?.privacy_show_on_charts ?? meta.privacy_show_on_charts,
      true,
    ),
  };

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-3 text-sm text-white/55">
            <Link href="/dashboard" className="hover:text-white">
              Home
            </Link>
            <Link href="/profile" className="text-[#1DB954]">
              You
            </Link>
          </nav>
        </div>
      </header>
      <ProfileSettings
        displayName={displayName}
        email={user.email || ""}
        genres={genres}
        countries={countries}
        privacy={privacy}
      />
    </main>
  );
}
