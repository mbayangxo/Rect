import { redirect } from "next/navigation";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createClient } from "@/lib/supabase/server";

export type StudioArtistContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  displayName: string;
  email: string | null;
};

/** Gate Artist OS — listeners redirect to /dashboard. */
export async function requireStudioArtist(
  loginNext = "/studio",
): Promise<StudioArtistContext> {
  const supabase = await createClient();
  const current = await getDashboardCurrentUser(supabase);

  if (!current.ok || !current.user) {
    redirect(`/auth/login?next=${encodeURIComponent(loginNext)}`);
  }

  if (!isArtistAccount(current.profile, current.user)) {
    redirect("/dashboard");
  }

  const user = current.user;
  const displayName =
    current.displayName ||
    (typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : null) ||
    user.email?.split("@")[0] ||
    "Artist";

  return {
    supabase,
    userId: user.id,
    displayName,
    email: user.email ?? null,
  };
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export type StudioPortalProfile = {
  displayName: string;
  city: string;
  artistBio: string;
  countries: string[];
  genres: string[];
  avatarUrl: string | null;
  bannerUrl: string | null;
};

export async function loadStudioPortalProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  fallbackDisplayName: string,
): Promise<StudioPortalProfile> {
  const full = await supabase
    .from("users")
    .select(
      "display_name, city, artist_bio, countries, genres, avatar_url, artist_banner_url",
    )
    .eq("id", userId)
    .maybeSingle();

  if (!full.error && full.data) {
    return {
      displayName:
        (typeof full.data.display_name === "string" &&
          full.data.display_name.trim()) ||
        fallbackDisplayName,
      city: typeof full.data.city === "string" ? full.data.city : "",
      artistBio:
        typeof full.data.artist_bio === "string" ? full.data.artist_bio : "",
      countries: asStringList(full.data.countries),
      genres: asStringList(full.data.genres),
      avatarUrl:
        typeof full.data.avatar_url === "string" && full.data.avatar_url.trim()
          ? full.data.avatar_url.trim()
          : null,
      bannerUrl:
        typeof full.data.artist_banner_url === "string" &&
        full.data.artist_banner_url.trim()
          ? full.data.artist_banner_url.trim()
          : null,
    };
  }

  if (
    full.error &&
    /artist_banner_url|column .* does not exist/i.test(full.error.message)
  ) {
    const lean = await supabase
      .from("users")
      .select(
        "display_name, city, artist_bio, countries, genres, avatar_url",
      )
      .eq("id", userId)
      .maybeSingle();
    if (lean.data) {
      return {
        displayName:
          (typeof lean.data.display_name === "string" &&
            lean.data.display_name.trim()) ||
          fallbackDisplayName,
        city: typeof lean.data.city === "string" ? lean.data.city : "",
        artistBio:
          typeof lean.data.artist_bio === "string" ? lean.data.artist_bio : "",
        countries: asStringList(lean.data.countries),
        genres: asStringList(lean.data.genres),
        avatarUrl:
          typeof lean.data.avatar_url === "string" &&
          lean.data.avatar_url.trim()
            ? lean.data.avatar_url.trim()
            : null,
        bannerUrl: null,
      };
    }
  }

  return {
    displayName: fallbackDisplayName,
    city: "",
    artistBio: "",
    countries: [],
    genres: [],
    avatarUrl: null,
    bannerUrl: null,
  };
}
