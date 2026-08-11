import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatPlayedAt,
  loadSharedListeningActivity,
  type JournalEntry,
} from "@/lib/dashboard/listening-journal";
import {
  loadPublicLikedTracks,
  type LikedTrack,
} from "@/lib/dashboard/likes";
import {
  loadPublicFollowedArtists,
  type FollowedArtist,
} from "@/lib/dashboard/follows";
import {
  loadPublicPlaylistsByOwner,
  type PlaylistSummary,
} from "@/lib/dashboard/playlists";
import {
  loadPublicSavedPlaylists,
  type FollowedPlaylist,
} from "@/lib/dashboard/playlist-follows";
import { isProfilePublic } from "@/lib/dashboard/privacy";
import { normalizeTasteList } from "@/lib/dashboard/taste";

export type PublicPerson = {
  id: string;
  display_name: string;
  is_artist: boolean;
  avatar_url: string | null;
  countries: string[];
  genres: string[];
  sharing_activity: boolean;
  sharing_likes: boolean;
  sharing_saves: boolean;
  sharing_followed_artists: boolean;
  activity: JournalEntry[];
  liked_tracks: LikedTrack[];
  playlists: PlaylistSummary[];
  saved_playlists: FollowedPlaylist[];
  followed_artists: FollowedArtist[];
};

export type PublicPersonResult =
  | {
      ok: true;
      person: PublicPerson;
      private: false;
      notFound: false;
      error: null;
    }
  | {
      ok: true;
      person: null;
      private: true;
      notFound: false;
      error: null;
      display_name: string | null;
    }
  | {
      ok: false;
      person: null;
      private: false;
      notFound: true;
      error: null;
    }
  | {
      ok: false;
      person: null;
      private: false;
      notFound: false;
      error: string;
    };

/** Href for any RECT user — fans land on /people; artists are redirected there to portal. */
export function personProfileHref(userId: string) {
  return `/people/${userId}`;
}

/**
 * Privacy-gated public person profile (fans + artists).
 * Uses admin reader when available so fan rows aren't blocked by artist-only RLS.
 */
export async function loadPublicPerson(
  supabase: SupabaseClient,
  userId: string,
): Promise<PublicPersonResult> {
  const id = userId.trim();
  if (!id) {
    return {
      ok: false,
      person: null,
      private: false,
      notFound: true,
      error: null,
    };
  }

  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const full = await db
      .from("users")
      .select(
        "id, display_name, account_type, role, countries, genres, avatar_url, privacy_public_profile",
      )
      .eq("id", id)
      .maybeSingle();

    let row: Record<string, unknown> | null = null;
    if (
      full.error &&
      /privacy_public_profile|countries|genres|avatar_url|column .* does not exist/i.test(
        full.error.message,
      )
    ) {
      const lean = await db
        .from("users")
        .select(
          "id, display_name, account_type, role, countries, genres, privacy_public_profile",
        )
        .eq("id", id)
        .maybeSingle();
      if (
        lean.error &&
        /privacy_public_profile|countries|genres|column .* does not exist/i.test(
          lean.error.message,
        )
      ) {
        const bare = await db
          .from("users")
          .select("id, display_name, account_type, role")
          .eq("id", id)
          .maybeSingle();
        if (bare.error) {
          return {
            ok: false,
            person: null,
            private: false,
            notFound: false,
            error: bare.error.message,
          };
        }
        row = bare.data as Record<string, unknown> | null;
      } else if (lean.error) {
        return {
          ok: false,
          person: null,
          private: false,
          notFound: false,
          error: lean.error.message,
        };
      } else {
        row = lean.data as Record<string, unknown> | null;
      }
    } else if (full.error) {
      return {
        ok: false,
        person: null,
        private: false,
        notFound: false,
        error: full.error.message,
      };
    } else {
      row = full.data as Record<string, unknown> | null;
    }

    if (!row) {
      return {
        ok: false,
        person: null,
        private: false,
        notFound: true,
        error: null,
      };
    }

    const publicOk = isProfilePublic({
      privacy_public_profile:
        (row.privacy_public_profile as boolean | null | undefined) ?? true,
    });

    const name =
      typeof row.display_name === "string" && row.display_name.trim()
        ? row.display_name.trim()
        : "Listener";

    if (!publicOk) {
      return {
        ok: true,
        person: null,
        private: true,
        notFound: false,
        error: null,
        display_name: null,
      };
    }

    const isArtist =
      row.account_type === "artist" || row.role === "artist";

    const [activity, mixes, likes, saved, artists] = await Promise.all([
      loadSharedListeningActivity(db, id, 8),
      loadPublicPlaylistsByOwner(db, id, 8),
      loadPublicLikedTracks(supabase, id, 12),
      loadPublicSavedPlaylists(supabase, id, 8),
      loadPublicFollowedArtists(supabase, id, 12),
    ]);

    return {
      ok: true,
      person: {
        id,
        display_name: name,
        is_artist: isArtist,
        avatar_url:
          typeof row.avatar_url === "string" && row.avatar_url.trim()
            ? row.avatar_url.trim()
            : null,
        countries: normalizeTasteList(row.countries),
        genres: normalizeTasteList(row.genres),
        sharing_activity: activity.sharing,
        sharing_likes: likes.sharing,
        sharing_saves: saved.sharing,
        sharing_followed_artists: artists.sharing,
        activity: activity.entries,
        liked_tracks: likes.tracks,
        playlists: mixes.playlists,
        saved_playlists: saved.playlists,
        followed_artists: artists.artists,
      },
      private: false,
      notFound: false,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      person: null,
      private: false,
      notFound: false,
      error: e instanceof Error ? e.message : "Failed to load profile",
    };
  }
}

export { formatPlayedAt };
