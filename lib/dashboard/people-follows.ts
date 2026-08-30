import type { SupabaseClient } from "@supabase/supabase-js";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { loadBlockedEitherIds } from "@/lib/dashboard/blocks";
import {
  formatPlayedAt,
  type JournalEntry,
} from "@/lib/dashboard/listening-journal";
import { isProfilePublic } from "@/lib/dashboard/privacy";
import {
  likeThanksKey,
  loadMyLikeThanksMap,
} from "@/lib/dashboard/like-thanks";
import { loadMyMixThanksMap } from "@/lib/dashboard/mix-thanks";
import { loadMyPlayThanksMap } from "@/lib/dashboard/play-thanks";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoTrack, isPublishedTrack, type TrackRow } from "@/lib/tracks";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type FollowedPerson = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  genres: string[];
  countries: string[];
  followed_at: string | null;
  /** Viewer follows this person (when enriched). */
  viewer_follows?: boolean;
  /** This person follows the viewer (when enriched). */
  follows_viewer?: boolean;
};

export type FriendsListenItem = JournalEntry & {
  listener_id: string;
  listener_name: string;
  /** Thanks the viewer already sent on this play. */
  thanks_message?: string | null;
};

export type FriendsLikeItem = TrackRow & {
  like_id: string;
  liked_at: string | null;
  liker_id: string;
  liker_name: string;
  /** Thanks the viewer already sent on this like. */
  thanks_message?: string | null;
};

export type FriendsMixItem = {
  id: string;
  name: string;
  description: string | null;
  cover_art_url: string | null;
  updated_at: string | null;
  owner_id: string;
  owner_name: string;
  /** Thanks the viewer already sent on this mix. */
  thanks_message?: string | null;
};

export async function loadPeopleFollowerCount(
  supabase: SupabaseClient,
  personId: string,
): Promise<{ count: number; missingTable: boolean }> {
  try {
    const { count, error } = await supabase
      .from("people_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("person_id", personId);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { count: 0, missingTable: true };
      }
      return { count: 0, missingTable: false };
    }
    return { count: count ?? 0, missingTable: false };
  } catch {
    return { count: 0, missingTable: false };
  }
}

export async function loadPeopleFollowingCount(
  supabase: SupabaseClient,
  personId: string,
): Promise<{ count: number; missingTable: boolean }> {
  try {
    const { count, error } = await supabase
      .from("people_follows")
      .select("person_id", { count: "exact", head: true })
      .eq("follower_id", personId);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { count: 0, missingTable: true };
      }
      return { count: 0, missingTable: false };
    }
    return { count: count ?? 0, missingTable: false };
  } catch {
    return { count: 0, missingTable: false };
  }
}

export async function loadIsFollowingPerson(
  supabase: SupabaseClient,
  followerId: string,
  personId: string,
): Promise<{ following: boolean; missingTable: boolean }> {
  try {
    const { data, error } = await supabase
      .from("people_follows")
      .select("person_id")
      .eq("follower_id", followerId)
      .eq("person_id", personId)
      .maybeSingle();

    if (error) {
      if (isMissingRelation(error.message)) {
        return { following: false, missingTable: true };
      }
      return { following: false, missingTable: false };
    }
    return { following: Boolean(data), missingTable: false };
  } catch {
    return { following: false, missingTable: false };
  }
}

/** Which of `personIds` the follower already follows (batch). */
export async function loadFollowingAmong(
  supabase: SupabaseClient,
  followerId: string,
  personIds: string[],
): Promise<{ followingIds: string[]; missingTable: boolean }> {
  const unique = [...new Set(personIds.filter(Boolean))];
  if (unique.length === 0) {
    return { followingIds: [], missingTable: false };
  }

  try {
    const { data, error } = await supabase
      .from("people_follows")
      .select("person_id")
      .eq("follower_id", followerId)
      .in("person_id", unique);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { followingIds: [], missingTable: true };
      }
      return { followingIds: [], missingTable: false };
    }

    return {
      followingIds: (data ?? [])
        .map((r) => r.person_id as string)
        .filter(Boolean),
      missingTable: false,
    };
  } catch {
    return { followingIds: [], missingTable: false };
  }
}

/** Which of `followerIds` already follow `personId` (batch). */
export async function loadFollowersAmong(
  supabase: SupabaseClient,
  personId: string,
  followerIds: string[],
): Promise<{ followerIds: string[]; missingTable: boolean }> {
  const unique = [...new Set(followerIds.filter(Boolean))];
  if (unique.length === 0) {
    return { followerIds: [], missingTable: false };
  }

  try {
    const { data, error } = await supabase
      .from("people_follows")
      .select("follower_id")
      .eq("person_id", personId)
      .in("follower_id", unique);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { followerIds: [], missingTable: true };
      }
      return { followerIds: [], missingTable: false };
    }

    return {
      followerIds: (data ?? [])
        .map((r) => r.follower_id as string)
        .filter(Boolean),
      missingTable: false,
    };
  } catch {
    return { followerIds: [], missingTable: false };
  }
}

export async function loadPersonFollowRelation(
  supabase: SupabaseClient,
  viewerId: string,
  personId: string,
): Promise<{
  following: boolean;
  follows_you: boolean;
  mutual: boolean;
  missingTable: boolean;
}> {
  if (viewerId === personId) {
    return {
      following: false,
      follows_you: false,
      mutual: false,
      missingTable: false,
    };
  }

  const [followingRes, followsYouRes] = await Promise.all([
    loadIsFollowingPerson(supabase, viewerId, personId),
    loadIsFollowingPerson(supabase, personId, viewerId),
  ]);

  const missingTable =
    followingRes.missingTable || followsYouRes.missingTable;
  const following = followingRes.following;
  const follows_you = followsYouRes.following;

  return {
    following,
    follows_you,
    mutual: following && follows_you,
    missingTable,
  };
}

/** Attach viewer↔person follow flags on a roster. */
export async function attachViewerFollowState(
  supabase: SupabaseClient,
  viewerId: string | null | undefined,
  people: FollowedPerson[],
): Promise<{ people: FollowedPerson[]; missingTable: boolean }> {
  if (!viewerId || people.length === 0) {
    return { people, missingTable: false };
  }

  const ids = people.map((p) => p.id).filter((id) => id && id !== viewerId);
  const [iFollow, theyFollow] = await Promise.all([
    loadFollowingAmong(supabase, viewerId, ids),
    loadFollowersAmong(supabase, viewerId, ids),
  ]);

  if (iFollow.missingTable || theyFollow.missingTable) {
    return { people, missingTable: true };
  }

  const iSet = new Set(iFollow.followingIds);
  const theySet = new Set(theyFollow.followerIds);

  return {
    people: people.map((p) => ({
      ...p,
      viewer_follows: iSet.has(p.id),
      follows_viewer: theySet.has(p.id),
    })),
    missingTable: false,
  };
}

export async function togglePeopleFollow(
  supabase: SupabaseClient,
  personId: string,
): Promise<
  | {
      ok: true;
      following: boolean;
      person_id: string;
      follower_count: number;
    }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "cannot_follow_self"
        | "missing_table"
        | "profile_private"
        | "person_not_found"
        | "failed";
    }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Sign in required",
      code: "not_authenticated",
    };
  }
  if (user.id === personId) {
    return {
      ok: false,
      error: "You can’t follow yourself",
      code: "cannot_follow_self",
    };
  }

  const { data, error } = await supabase.rpc("toggle_people_follow", {
    p_person_id: personId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run people follows SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/cannot_follow_self/i.test(error.message)) {
      return {
        ok: false,
        error: "You can’t follow yourself",
        code: "cannot_follow_self",
      };
    }
    if (/profile_private/i.test(error.message)) {
      return {
        ok: false,
        error: "This profile is private",
        code: "profile_private",
      };
    }
    if (/blocked/i.test(error.message)) {
      return {
        ok: false,
        error: "You can’t follow this person",
        code: "failed",
      };
    }
    if (/person_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Person not found",
        code: "person_not_found",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as {
    following?: boolean;
    person_id?: string;
    follower_count?: number;
  } | null;

  return {
    ok: true,
    following: Boolean(row?.following),
    person_id: String(row?.person_id ?? personId),
    follower_count: Number(row?.follower_count) || 0,
  };
}

export async function loadFollowedPeople(
  supabase: SupabaseClient,
  userId: string,
  limit = 60,
): Promise<{
  people: FollowedPerson[];
  missingTable: boolean;
  error: string | null;
}> {
  try {
    const { data: follows, error } = await supabase
      .from("people_follows")
      .select("person_id, created_at")
      .eq("follower_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { people: [], missingTable: true, error: null };
      }
      return { people: [], missingTable: false, error: error.message };
    }

    const rows = follows ?? [];
    if (rows.length === 0) {
      return { people: [], missingTable: false, error: null };
    }

    const ids = rows.map((r) => r.person_id as string).filter(Boolean);
    const followedAt = new Map<string, string | null>();
    for (const r of rows) {
      followedAt.set(
        r.person_id as string,
        (r.created_at as string | null) ?? null,
      );
    }

    return hydratePublicPeople(supabase, ids, followedAt);
  } catch (e) {
    return {
      people: [],
      missingTable: false,
      error: e instanceof Error ? e.message : "Failed to load people",
    };
  }
}

/**
 * People who follow this person (caller must already be allowed — own or RPC).
 */
export async function loadPeopleFollowers(
  supabase: SupabaseClient,
  personId: string,
  limit = 40,
): Promise<{
  people: FollowedPerson[];
  missingTable: boolean;
  error: string | null;
}> {
  try {
    const { data: follows, error } = await supabase
      .from("people_follows")
      .select("follower_id, created_at")
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { people: [], missingTable: true, error: null };
      }
      return { people: [], missingTable: false, error: error.message };
    }

    const rows = follows ?? [];
    if (rows.length === 0) {
      return { people: [], missingTable: false, error: null };
    }

    const ids = rows.map((r) => r.follower_id as string).filter(Boolean);
    const followedAt = new Map<string, string | null>();
    for (const r of rows) {
      followedAt.set(
        r.follower_id as string,
        (r.created_at as string | null) ?? null,
      );
    }

    return hydratePublicPeople(supabase, ids, followedAt);
  } catch (e) {
    return {
      people: [],
      missingTable: false,
      error: e instanceof Error ? e.message : "Failed to load followers",
    };
  }
}

/**
 * Opt-in public Followers / Following on /people/[id].
 * Owner always gets sharing=true (own RLS). Visitors need privacy_show_followers.
 */
export async function loadPublicPeopleFollowGraph(
  supabase: SupabaseClient,
  personId: string,
  opts?: { viewerId?: string | null; limit?: number },
): Promise<{
  sharing: boolean;
  missingColumn: boolean;
  missingTable: boolean;
  followerCount: number;
  followingCount: number;
  followers: FollowedPerson[];
  following: FollowedPerson[];
  error: string | null;
}> {
  const id = personId.trim();
  const limit = opts?.limit ?? 40;
  const viewerId = opts?.viewerId ?? null;
  const empty = {
    sharing: false,
    missingColumn: false,
    missingTable: false,
    followerCount: 0,
    followingCount: 0,
    followers: [] as FollowedPerson[],
    following: [] as FollowedPerson[],
    error: null as string | null,
  };

  if (!id) return empty;

  const isOwner = Boolean(viewerId && viewerId === id);

  try {
    const full = await supabase
      .from("users")
      .select("privacy_public_profile, privacy_show_followers")
      .eq("id", id)
      .maybeSingle();

    if (
      full.error &&
      /privacy_show_followers|column .* does not exist/i.test(full.error.message)
    ) {
      // Pre-migration: hide from visitors; owner still sees own graph via RLS.
      if (!isOwner) {
        return { ...empty, missingColumn: true };
      }
    } else if (full.error) {
      return { ...empty, error: full.error.message };
    }

    const publicOk = isProfilePublic({
      privacy_public_profile: full.data?.privacy_public_profile ?? true,
    });
    const showFollowers =
      isOwner ||
      (full.error == null && full.data?.privacy_show_followers === true);

    if (!isOwner && (!publicOk || !showFollowers)) {
      return {
        ...empty,
        missingColumn: Boolean(
          full.error &&
            /privacy_show_followers|column .* does not exist/i.test(
              full.error.message,
            ),
        ),
      };
    }

    if (isOwner) {
      const sharing =
        full.error == null && full.data?.privacy_show_followers === true;
      const missingColumn = Boolean(
        full.error &&
          /privacy_show_followers|column .* does not exist/i.test(
            full.error.message,
          ),
      );

      if (!sharing) {
        const probe = await loadPeopleFollowerCount(supabase, id);
        return {
          ...empty,
          sharing: false,
          missingColumn,
          missingTable: probe.missingTable,
        };
      }

      const [followerCount, followingCount, followersRes, followingRes] =
        await Promise.all([
          loadPeopleFollowerCount(supabase, id),
          loadPeopleFollowingCount(supabase, id),
          loadPeopleFollowers(supabase, id, limit),
          loadFollowedPeople(supabase, id, limit),
        ]);
      const missingTable =
        followerCount.missingTable ||
        followingCount.missingTable ||
        followersRes.missingTable ||
        followingRes.missingTable;
      return {
        sharing: true,
        missingColumn: false,
        missingTable,
        followerCount: followerCount.count,
        followingCount: followingCount.count,
        followers: followersRes.people,
        following: followingRes.people,
        error: followersRes.error || followingRes.error,
      };
    }

    // Visitors: security-definer RPCs (and counts).
    const countsRpc = await supabase.rpc("person_people_follow_counts", {
      p_person_id: id,
    });

    let followerCount = 0;
    let followingCount = 0;
    let sharing = true;

    if (!countsRpc.error && countsRpc.data && typeof countsRpc.data === "object") {
      const row = countsRpc.data as {
        sharing?: boolean;
        followers?: number;
        following?: number;
        missing_table?: boolean;
      };
      if (row.missing_table) {
        return { ...empty, missingTable: true, sharing: false };
      }
      sharing = row.sharing === true;
      followerCount = Number(row.followers) || 0;
      followingCount = Number(row.following) || 0;
      if (!sharing) {
        return { ...empty, sharing: false };
      }
    } else if (countsRpc.error && isMissingRelation(countsRpc.error.message)) {
      // RPC missing — fall back only if public select still exists (pre-tighten).
      const [fc, gc] = await Promise.all([
        loadPeopleFollowerCount(supabase, id),
        loadPeopleFollowingCount(supabase, id),
      ]);
      if (fc.missingTable || gc.missingTable) {
        return { ...empty, missingTable: true };
      }
      followerCount = fc.count;
      followingCount = gc.count;
    } else if (countsRpc.error) {
      return { ...empty, sharing: true, error: countsRpc.error.message };
    }

    const [followersRpc, followingRpc] = await Promise.all([
      supabase.rpc("person_people_followers", {
        p_person_id: id,
        p_limit: limit,
      }),
      supabase.rpc("person_people_following", {
        p_person_id: id,
        p_limit: limit,
      }),
    ]);

    let followerIds: string[] = [];
    let followingIds: string[] = [];
    const followerAt = new Map<string, string | null>();
    const followingAt = new Map<string, string | null>();

    if (!followersRpc.error) {
      for (const r of (followersRpc.data ?? []) as {
        follower_id?: string;
        followed_at?: string | null;
      }[]) {
        if (typeof r.follower_id === "string" && r.follower_id) {
          followerIds.push(r.follower_id);
          followerAt.set(r.follower_id, r.followed_at ?? null);
        }
      }
    } else if (isMissingRelation(followersRpc.error.message)) {
      const fallback = await loadPeopleFollowers(supabase, id, limit);
      if (fallback.missingTable) {
        return { ...empty, missingTable: true, sharing: true };
      }
      if (fallback.error) {
        return { ...empty, sharing: true, error: fallback.error };
      }
      const followingFallback = await loadFollowedPeople(supabase, id, limit);
      return {
        sharing: true,
        missingColumn: false,
        missingTable: followingFallback.missingTable,
        followerCount,
        followingCount,
        followers: fallback.people,
        following: followingFallback.people,
        error: followingFallback.error,
      };
    } else {
      return { ...empty, sharing: true, error: followersRpc.error.message };
    }

    if (!followingRpc.error) {
      for (const r of (followingRpc.data ?? []) as {
        person_id?: string;
        followed_at?: string | null;
      }[]) {
        if (typeof r.person_id === "string" && r.person_id) {
          followingIds.push(r.person_id);
          followingAt.set(r.person_id, r.followed_at ?? null);
        }
      }
    } else if (!isMissingRelation(followingRpc.error.message)) {
      return { ...empty, sharing: true, error: followingRpc.error.message };
    }

    const [followersHydrated, followingHydrated] = await Promise.all([
      hydratePublicPeople(supabase, followerIds, followerAt),
      hydratePublicPeople(supabase, followingIds, followingAt),
    ]);

    return {
      sharing: true,
      missingColumn: false,
      missingTable:
        followersHydrated.missingTable || followingHydrated.missingTable,
      followerCount,
      followingCount,
      followers: followersHydrated.people,
      following: followingHydrated.people,
      error: followersHydrated.error || followingHydrated.error,
    };
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : "Failed to load follow graph",
    };
  }
}

async function hydratePublicPeople(
  supabase: SupabaseClient,
  ids: string[],
  followedAt: Map<string, string | null>,
): Promise<{
  people: FollowedPerson[];
  missingTable: boolean;
  error: string | null;
}> {
  const admin = createAdminClient();
  const db = admin ?? supabase;

  let userRows: Record<string, unknown>[] | null = null;
  const full = await db
    .from("users")
    .select(
      "id, display_name, genres, countries, avatar_url, privacy_public_profile",
    )
    .in("id", ids);

  if (
    full.error &&
    /avatar_url|countries|privacy_public_profile|column .* does not exist/i.test(
      full.error.message,
    )
  ) {
    const lean = await db
      .from("users")
      .select("id, display_name, genres, privacy_public_profile")
      .in("id", ids);
    if (lean.error) {
      return { people: [], missingTable: false, error: lean.error.message };
    }
    userRows = (lean.data ?? []) as Record<string, unknown>[];
  } else if (full.error) {
    return { people: [], missingTable: false, error: full.error.message };
  } else {
    userRows = (full.data ?? []) as Record<string, unknown>[];
  }

  const byId = new Map(
    (userRows ?? [])
      .filter((row) =>
        isProfilePublic(row as { privacy_public_profile?: boolean | null }),
      )
      .map((row) => [row.id as string, row]),
  );

  const people: FollowedPerson[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    const genres = Array.isArray(row.genres)
      ? (row.genres as unknown[]).filter(
          (g): g is string => typeof g === "string",
        )
      : [];
    const countries = Array.isArray(row.countries)
      ? (row.countries as unknown[]).filter(
          (c): c is string => typeof c === "string",
        )
      : [];
    people.push({
      id,
      display_name:
        (typeof row.display_name === "string" && row.display_name.trim()) ||
        "Listener",
      avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
      genres,
      countries,
      followed_at: followedAt.get(id) ?? null,
    });
  }

  return { people, missingTable: false, error: null };
}

/**
 * Recent plays from people you follow (privacy_show_activity gated by RLS).
 */
export async function loadFriendsListening(
  supabase: SupabaseClient,
  userId: string,
  limit = 12,
): Promise<{
  items: FriendsListenItem[];
  missingTable: boolean;
  error: string | null;
}> {
  try {
    const { data: follows, error: followError } = await supabase
      .from("people_follows")
      .select("person_id")
      .eq("follower_id", userId)
      .limit(80);

    if (followError) {
      if (isMissingRelation(followError.message)) {
        return { items: [], missingTable: true, error: null };
      }
      return { items: [], missingTable: false, error: followError.message };
    }

    const personIdsRaw = (follows ?? [])
      .map((r) => r.person_id as string)
      .filter(Boolean);

    if (personIdsRaw.length === 0) {
      return { items: [], missingTable: false, error: null };
    }

    const blocked = await loadBlockedEitherIds(supabase, userId);
    const hide = new Set(
      !blocked.missingTable && blocked.ids.length > 0 ? blocked.ids : [],
    );
    const personIds =
      hide.size > 0
        ? personIdsRaw.filter((id) => !hide.has(id))
        : personIdsRaw;

    if (personIds.length === 0) {
      return { items: [], missingTable: false, error: null };
    }

    type PlayRow = {
      id: string | number;
      track_id: string;
      listener_id: string;
      created_at?: string | null;
    };

    const playRes = await supabase
      .from("plays")
      .select("id, track_id, listener_id, created_at")
      .in("listener_id", personIds)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 4, 40));

    if (playRes.error) {
      if (isMissingRelation(playRes.error.message)) {
        return { items: [], missingTable: false, error: null };
      }
      return {
        items: [],
        missingTable: false,
        error: playRes.error.message,
      };
    }

    const playRows = (playRes.data ?? []) as PlayRow[];
    if (playRows.length === 0) {
      return { items: [], missingTable: false, error: null };
    }

    const trackIds = [
      ...new Set(playRows.map((p) => p.track_id).filter(Boolean)),
    ];
    const listenerIds = [
      ...new Set(playRows.map((p) => p.listener_id).filter(Boolean)),
    ];

    const tracksRes = await supabase
      .from("tracks")
      .select(
        "id, title, artist_id, genre, status, audio_url, cover_art_url, play_count, duration_secs",
      )
      .in("id", trackIds);

    if (tracksRes.error) {
      return {
        items: [],
        missingTable: false,
        error: tracksRes.error.message,
      };
    }

    const tracks = (tracksRes.data ?? []) as TrackRow[];
    const artistIds = [
      ...new Set(tracks.map((t) => t.artist_id).filter(Boolean) as string[]),
    ];
    const nameMap = await loadArtistCreditMap(supabase, [
      ...new Set([...listenerIds, ...artistIds]),
    ]);

    const trackById = new Map(
      tracks
        .filter((t) => t?.id && !isDemoTrack(t) && t.audio_url)
        .map((t) => [
          t.id,
          {
            ...t,
            artist_name: t.artist_id
              ? nameMap.get(t.artist_id) || null
              : null,
          },
        ]),
    );

    const seen = new Set<string>();
    const items: FriendsListenItem[] = [];
    for (const play of playRows) {
      const track = trackById.get(play.track_id);
      if (!track) continue;
      const key = `${play.listener_id}:${track.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        ...track,
        play_id: String(play.id),
        played_at: play.created_at ?? null,
        listener_id: play.listener_id,
        listener_name: nameMap.get(play.listener_id) || "Listener",
        thanks_message: null,
      });
      if (items.length >= limit) break;
    }

    if (items.length > 0) {
      const thanksMap = await loadMyPlayThanksMap(
        supabase,
        userId,
        items.map((i) => i.play_id),
      );
      for (const item of items) {
        item.thanks_message = thanksMap.get(item.play_id) ?? null;
      }
    }

    return { items, missingTable: false, error: null };
  } catch (e) {
    return {
      items: [],
      missingTable: false,
      error: e instanceof Error ? e.message : "Failed to load friends listening",
    };
  }
}

/**
 * Recent likes from people you follow (privacy_show_likes + public profile via RLS).
 */
export async function loadFriendsLikes(
  supabase: SupabaseClient,
  userId: string,
  limit = 12,
): Promise<{
  items: FriendsLikeItem[];
  missingTable: boolean;
  error: string | null;
}> {
  try {
    const { data: follows, error: followError } = await supabase
      .from("people_follows")
      .select("person_id")
      .eq("follower_id", userId)
      .limit(80);

    if (followError) {
      if (isMissingRelation(followError.message)) {
        return { items: [], missingTable: true, error: null };
      }
      return { items: [], missingTable: false, error: followError.message };
    }

    let personIds = (follows ?? [])
      .map((r) => r.person_id as string)
      .filter(Boolean);

    if (personIds.length === 0) {
      return { items: [], missingTable: false, error: null };
    }

    const blocked = await loadBlockedEitherIds(supabase, userId);
    if (!blocked.missingTable && blocked.ids.length > 0) {
      const hide = new Set(blocked.ids);
      personIds = personIds.filter((id) => !hide.has(id));
    }
    if (personIds.length === 0) {
      return { items: [], missingTable: false, error: null };
    }

    type LikeRow = {
      track_id: string;
      user_id: string;
      created_at?: string | null;
    };

    const likeRes = await supabase
      .from("track_likes")
      .select("track_id, user_id, created_at")
      .in("user_id", personIds)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 4, 40));

    if (likeRes.error) {
      if (isMissingRelation(likeRes.error.message)) {
        return { items: [], missingTable: true, error: null };
      }
      return {
        items: [],
        missingTable: false,
        error: likeRes.error.message,
      };
    }

    const likeRows = (likeRes.data ?? []) as LikeRow[];
    if (likeRows.length === 0) {
      return { items: [], missingTable: false, error: null };
    }

    const trackIds = [
      ...new Set(likeRows.map((r) => r.track_id).filter(Boolean)),
    ];
    const likerIds = [
      ...new Set(likeRows.map((r) => r.user_id).filter(Boolean)),
    ];

    const tracksRes = await supabase
      .from("tracks")
      .select(
        "id, title, artist_id, genre, status, audio_url, cover_art_url, play_count, duration_secs",
      )
      .in("id", trackIds);

    if (tracksRes.error) {
      return {
        items: [],
        missingTable: false,
        error: tracksRes.error.message,
      };
    }

    const tracks = (tracksRes.data ?? []) as TrackRow[];
    const artistIds = [
      ...new Set(tracks.map((t) => t.artist_id).filter(Boolean) as string[]),
    ];
    const nameMap = await loadArtistCreditMap(supabase, [
      ...new Set([...likerIds, ...artistIds]),
    ]);

    const trackById = new Map(
      tracks
        .filter(
          (t) =>
            t?.id && !isDemoTrack(t) && isPublishedTrack(t) && t.audio_url,
        )
        .map((t) => [
          t.id,
          {
            ...t,
            artist_name: t.artist_id
              ? nameMap.get(t.artist_id) || null
              : null,
          },
        ]),
    );

    const seen = new Set<string>();
    const items: FriendsLikeItem[] = [];
    for (const like of likeRows) {
      const track = trackById.get(like.track_id);
      if (!track) continue;
      const key = `${like.user_id}:${track.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        ...track,
        like_id: `${like.user_id}:${track.id}:${like.created_at ?? ""}`,
        liked_at: like.created_at ?? null,
        liker_id: like.user_id,
        liker_name: nameMap.get(like.user_id) || "Listener",
        thanks_message: null,
      });
      if (items.length >= limit) break;
    }

    if (items.length > 0) {
      const thanksMap = await loadMyLikeThanksMap(
        supabase,
        userId,
        items.map((i) => ({ likerId: i.liker_id, trackId: i.id })),
      );
      for (const item of items) {
        item.thanks_message =
          thanksMap.get(likeThanksKey(item.liker_id, item.id)) ?? null;
      }
    }

    return { items, missingTable: false, error: null };
  } catch (e) {
    return {
      items: [],
      missingTable: false,
      error: e instanceof Error ? e.message : "Failed to load friends likes",
    };
  }
}

/**
 * Recent public mixes from people you follow (is_public RLS).
 */
export async function loadFriendsMixes(
  supabase: SupabaseClient,
  userId: string,
  limit = 12,
): Promise<{
  items: FriendsMixItem[];
  missingTable: boolean;
  error: string | null;
}> {
  try {
    const { data: follows, error: followError } = await supabase
      .from("people_follows")
      .select("person_id")
      .eq("follower_id", userId)
      .limit(80);

    if (followError) {
      if (isMissingRelation(followError.message)) {
        return { items: [], missingTable: true, error: null };
      }
      return { items: [], missingTable: false, error: followError.message };
    }

    let personIds = (follows ?? [])
      .map((r) => r.person_id as string)
      .filter(Boolean);

    if (personIds.length === 0) {
      return { items: [], missingTable: false, error: null };
    }

    const blocked = await loadBlockedEitherIds(supabase, userId);
    if (!blocked.missingTable && blocked.ids.length > 0) {
      const hide = new Set(blocked.ids);
      personIds = personIds.filter((id) => !hide.has(id));
    }
    if (personIds.length === 0) {
      return { items: [], missingTable: false, error: null };
    }

    let { data, error } = await supabase
      .from("playlists")
      .select(
        "id, name, description, cover_art_url, updated_at, user_id, is_public",
      )
      .in("user_id", personIds)
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .limit(Math.max(limit * 2, 24));

    if (error && /is_public|column .* does not exist/i.test(error.message)) {
      return { items: [], missingTable: false, error: null };
    }

    if (error && /cover_art_url|description|column .* does not exist/i.test(error.message)) {
      const lean = await supabase
        .from("playlists")
        .select("id, name, updated_at, user_id, is_public")
        .in("user_id", personIds)
        .eq("is_public", true)
        .order("updated_at", { ascending: false })
        .limit(Math.max(limit * 2, 24));
      data = (lean.data ?? []).map((r) => ({
        ...r,
        description: null,
        cover_art_url: null,
      }));
      error = lean.error;
    }

    if (error) {
      if (isMissingRelation(error.message)) {
        return { items: [], missingTable: true, error: null };
      }
      return { items: [], missingTable: false, error: error.message };
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return { items: [], missingTable: false, error: null };
    }

    const ownerIds = [
      ...new Set(rows.map((r) => r.user_id as string).filter(Boolean)),
    ];
    const nameMap = await loadArtistCreditMap(supabase, ownerIds);

    const items: FriendsMixItem[] = [];
    for (const r of rows) {
      const ownerId = r.user_id as string;
      if (!ownerId) continue;
      const cover =
        typeof r.cover_art_url === "string" && r.cover_art_url.trim()
          ? r.cover_art_url.trim()
          : null;
      if (!cover) continue;
      items.push({
        id: String(r.id),
        name:
          (typeof r.name === "string" && r.name.trim()) || "Untitled mix",
        description:
          typeof r.description === "string" && r.description.trim()
            ? r.description.trim()
            : null,
        cover_art_url: cover,
        updated_at: (r.updated_at as string | null) ?? null,
        owner_id: ownerId,
        owner_name: nameMap.get(ownerId) || "Listener",
        thanks_message: null,
      });
      if (items.length >= limit) break;
    }

    if (items.length > 0) {
      const thanksMap = await loadMyMixThanksMap(
        supabase,
        userId,
        items.map((i) => i.id),
      );
      for (const item of items) {
        item.thanks_message = thanksMap.get(item.id) ?? null;
      }
    }

    return { items, missingTable: false, error: null };
  } catch (e) {
    return {
      items: [],
      missingTable: false,
      error: e instanceof Error ? e.message : "Failed to load friends mixes",
    };
  }
}

export { formatPlayedAt };

export const PEOPLE_FOLLOW_THANKS_MAX = 280;

export async function sendPeopleFollowThanks(
  supabase: SupabaseClient,
  notificationId: number,
  messageRaw: string,
): Promise<
  | {
      ok: true;
      notification_id: number;
      thanks_message: string;
      skipped?: string;
    }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "missing_table"
        | "notification_not_found"
        | "not_recipient"
        | "not_a_people_follow"
        | "already_thanked"
        | "blocked"
        | "invalid_message"
        | "failed";
    }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Sign in required",
      code: "not_authenticated",
    };
  }

  const message = messageRaw.replace(/\s+/g, " ").trim();
  if (!message || message.length > PEOPLE_FOLLOW_THANKS_MAX) {
    return {
      ok: false,
      error: `Thanks must be 1–${PEOPLE_FOLLOW_THANKS_MAX} characters`,
      code: "invalid_message",
    };
  }

  const { data, error } = await supabase.rpc("send_people_follow_thanks", {
    p_notification_id: notificationId,
    p_message: message,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run people follow thanks SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/notification_not_found/i.test(error.message)) {
      return {
        ok: false,
        error: "Follow notification not found",
        code: "notification_not_found",
      };
    }
    if (/not_recipient/i.test(error.message)) {
      return {
        ok: false,
        error: "Only the person followed can thank",
        code: "not_recipient",
      };
    }
    if (/not_a_people_follow/i.test(error.message)) {
      return {
        ok: false,
        error: "Not a follow notification",
        code: "not_a_people_follow",
      };
    }
    if (/already_thanked/i.test(error.message)) {
      return {
        ok: false,
        error: "You already thanked for this follow",
        code: "already_thanked",
      };
    }
    if (/blocked/i.test(error.message)) {
      return {
        ok: false,
        error: "You can’t thank this person",
        code: "blocked",
      };
    }
    if (/message_required/i.test(error.message)) {
      return {
        ok: false,
        error: "Write a short thank-you",
        code: "invalid_message",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as {
    thanks_message?: string;
    notification_id?: number;
    skipped?: string;
  } | null;

  return {
    ok: true,
    notification_id: Number(row?.notification_id ?? notificationId),
    thanks_message:
      (typeof row?.thanks_message === "string" && row.thanks_message.trim()) ||
      message,
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

