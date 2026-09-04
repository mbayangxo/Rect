import type { SupabaseClient } from "@supabase/supabase-js";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { createAdminClient } from "@/lib/supabase/admin";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|schema cache/i.test(
    message,
  );
}

/** Public playlist trending on Discover — product name: Fan mixes. */
export type FanMixItem = {
  id: string;
  name: string;
  description: string | null;
  cover_art_url: string | null;
  updated_at: string | null;
  owner_id: string;
  owner_name: string;
  save_count: number;
  track_count: number;
};

/**
 * Popular Fan mixes — public playlists ranked by saves (playlist_follows),
 * then recent updates. Distinct from Friends mixes (people you follow).
 */
export async function loadPopularFanMixes(
  supabase: SupabaseClient,
  limit = 12,
): Promise<{
  items: FanMixItem[];
  missingTable: boolean;
  error: string | null;
}> {
  const admin = createAdminClient();
  const db = admin ?? supabase;

  try {
    let { data, error } = await db
      .from("playlists")
      .select(
        "id, name, description, cover_art_url, updated_at, user_id, is_public",
      )
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .limit(Math.max(limit * 6, 48));

    if (error && /is_public|column .* does not exist/i.test(error.message)) {
      return { items: [], missingTable: false, error: null };
    }

    if (
      error &&
      /cover_art_url|description|column .* does not exist/i.test(error.message)
    ) {
      const lean = await db
        .from("playlists")
        .select("id, name, updated_at, user_id, is_public")
        .eq("is_public", true)
        .order("updated_at", { ascending: false })
        .limit(Math.max(limit * 6, 48));
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

    const ids = rows.map((r) => r.id as string).filter(Boolean);

    const saveCount = new Map<string, number>();
    if (ids.length > 0) {
      const { data: follows, error: followErr } = await db
        .from("playlist_follows")
        .select("playlist_id")
        .in("playlist_id", ids);

      if (!followErr) {
        for (const row of follows ?? []) {
          const pid = row.playlist_id as string;
          if (!pid) continue;
          saveCount.set(pid, (saveCount.get(pid) ?? 0) + 1);
        }
      } else if (isMissingRelation(followErr.message)) {
        // Ranking falls back to updated_at only.
      }
    }

    const trackCount = new Map<string, number>();
    if (ids.length > 0) {
      const { data: links } = await db
        .from("playlist_tracks")
        .select("playlist_id")
        .in("playlist_id", ids);
      for (const row of links ?? []) {
        const pid = row.playlist_id as string;
        if (!pid) continue;
        trackCount.set(pid, (trackCount.get(pid) ?? 0) + 1);
      }
    }

    const ownerIds = [
      ...new Set(rows.map((r) => r.user_id as string).filter(Boolean)),
    ];
    const nameMap = await loadArtistCreditMap(db, ownerIds);

    const ranked = [...rows]
      .map((r) => {
        const id = String(r.id);
        const ownerId = r.user_id as string;
        const cover =
          typeof r.cover_art_url === "string" && r.cover_art_url.trim()
            ? r.cover_art_url.trim()
            : null;
        return {
          id,
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
          save_count: saveCount.get(id) ?? 0,
          track_count: trackCount.get(id) ?? 0,
        } satisfies FanMixItem;
      })
      .filter((m) => m.owner_id && m.track_count > 0)
      .sort((a, b) => {
        return (
          b.save_count - a.save_count ||
          (b.updated_at || "").localeCompare(a.updated_at || "")
        );
      })
      .slice(0, limit);

    return { items: ranked, missingTable: false, error: null };
  } catch (e) {
    return {
      items: [],
      missingTable: false,
      error: e instanceof Error ? e.message : "Failed to load Fan mixes",
    };
  }
}
