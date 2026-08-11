import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileSettings } from "@/components/profile-settings";
import { RectLogo } from "@/components/rect-logo";
import { loadBlockedPeople } from "@/lib/dashboard/blocks";
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
    role?: string | null;
    account_type?: string | null;
    countries?: unknown;
    genres?: unknown;
    avatar_url?: string | null;
    privacy_public_profile?: boolean | null;
    privacy_show_activity?: boolean | null;
    privacy_show_on_charts?: boolean | null;
    privacy_show_likes?: boolean | null;
    privacy_show_saves?: boolean | null;
    privacy_show_followed_artists?: boolean | null;
    privacy_show_followers?: boolean | null;
  } | null = null;

  const full = await supabase
    .from("users")
    .select(
      "display_name, role, countries, genres, account_type, avatar_url, privacy_public_profile, privacy_show_activity, privacy_show_on_charts, privacy_show_likes, privacy_show_saves, privacy_show_followed_artists, privacy_show_followers",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (full.error) {
    const lean = await supabase
      .from("users")
      .select(
        "display_name, role, countries, genres, account_type, privacy_public_profile, privacy_show_activity, privacy_show_on_charts, privacy_show_likes",
      )
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
    privacy_show_likes: asBool(
      profile?.privacy_show_likes ?? meta.privacy_show_likes,
      false,
    ),
    privacy_show_saves: asBool(
      profile?.privacy_show_saves ?? meta.privacy_show_saves,
      false,
    ),
    privacy_show_followed_artists: asBool(
      profile?.privacy_show_followed_artists ??
        meta.privacy_show_followed_artists,
      false,
    ),
    privacy_show_followers: asBool(
      profile?.privacy_show_followers ?? meta.privacy_show_followers,
      false,
    ),
  };

  const avatarUrl =
    (typeof profile?.avatar_url === "string" && profile.avatar_url.trim()) ||
    (typeof meta.avatar_url === "string" ? meta.avatar_url.trim() : "") ||
    null;

  const isArtist =
    profile?.account_type === "artist" ||
    profile?.role === "artist" ||
    meta.account_type === "artist" ||
    meta.role === "artist";

  const blockedRes = await loadBlockedPeople(supabase, user.id);

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
        publicProfileHref={`/people/${user.id}`}
        avatarUrl={avatarUrl}
        isArtist={isArtist}
        blockedPeople={blockedRes.people}
        blocksReady={!blockedRes.missingTable}
        blocksError={blockedRes.error}
      />
    </main>
  );
}
