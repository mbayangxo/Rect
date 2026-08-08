import type { SupabaseClient } from "@supabase/supabase-js";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { isDemoTrack, isPublishedTrack, type TrackRow } from "@/lib/tracks";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205/i.test(
    message,
  );
}

function normalizeDescription(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 280);
  return trimmed.length > 0 ? trimmed : null;
}

export type PlaylistSummary = {
  id: string;
  name: string;
  description: string | null;
  cover_art_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  track_count: number;
  is_public: boolean;
};

export type PlaylistTrack = TrackRow & {
  position: number;
  added_at: string | null;
};

export type PlaylistDetail = PlaylistSummary & {
  tracks: PlaylistTrack[];
  is_owner: boolean;
};

export type PlaylistsLoadResult = {
  playlists: PlaylistSummary[];
  missingTable: boolean;
  error: string | null;
};

export type PlaylistDetailResult = {
  playlist: PlaylistDetail | null;
  missingTable: boolean;
  error: string | null;
  notFound: boolean;
};

export async function loadUserPlaylists(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlaylistsLoadResult> {
  try {
    const { data, error } = await supabase
      .from("playlists")
      .select("id, name, description, cover_art_url, created_at, updated_at, is_public")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { playlists: [], missingTable: true, error: null };
      }
      // Missing description only — retry with is_public still selected
      if (
        /description/i.test(error.message) &&
        /column .* does not exist/i.test(error.message)
      ) {
        const retry = await supabase
          .from("playlists")
          .select("id, name, created_at, updated_at, is_public")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(50);
        if (!retry.error) {
          const rows = retry.data ?? [];
          if (rows.length === 0) {
            return { playlists: [], missingTable: false, error: null };
          }
          const ids = rows.map((r) => r.id as string);
          const countById = new Map<string, number>();
          const { data: trackRows } = await supabase
            .from("playlist_tracks")
            .select("playlist_id")
            .in("playlist_id", ids);
          for (const row of trackRows ?? []) {
            const pid = row.playlist_id as string;
            countById.set(pid, (countById.get(pid) ?? 0) + 1);
          }
          return {
            playlists: rows.map((r) => ({
              id: r.id as string,
              name: (r.name as string)?.trim() || "Playlist",
              description: null,
              cover_art_url: null,
              created_at: (r.created_at as string | null) ?? null,
              updated_at: (r.updated_at as string | null) ?? null,
              track_count: countById.get(r.id as string) ?? 0,
              is_public: Boolean(r.is_public),
            })),
            missingTable: false,
            error: null,
          };
        }
      }
      // Missing cover only — keep description + public
      if (
        /cover_art_url/i.test(error.message) &&
        /column .* does not exist/i.test(error.message)
      ) {
        const retry = await supabase
          .from("playlists")
          .select("id, name, description, created_at, updated_at, is_public")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(50);
        if (!retry.error) {
          const rows = retry.data ?? [];
          if (rows.length === 0) {
            return { playlists: [], missingTable: false, error: null };
          }
          const ids = rows.map((r) => r.id as string);
          const countById = new Map<string, number>();
          const { data: trackRows } = await supabase
            .from("playlist_tracks")
            .select("playlist_id")
            .in("playlist_id", ids);
          for (const row of trackRows ?? []) {
            const pid = row.playlist_id as string;
            countById.set(pid, (countById.get(pid) ?? 0) + 1);
          }
          return {
            playlists: rows.map((r) => ({
              id: r.id as string,
              name: (r.name as string)?.trim() || "Playlist",
              description: normalizeDescription(
                (r as { description?: unknown }).description,
              ),
              cover_art_url: null,
              created_at: (r.created_at as string | null) ?? null,
              updated_at: (r.updated_at as string | null) ?? null,
              track_count: countById.get(r.id as string) ?? 0,
              is_public: Boolean(r.is_public),
            })),
            missingTable: false,
            error: null,
          };
        }
      }
      if (/is_public|column .* does not exist/i.test(error.message)) {
        const legacy = await supabase
          .from("playlists")
          .select("id, name, created_at, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(50);
        if (legacy.error) {
          return {
            playlists: [],
            missingTable: isMissingRelation(legacy.error.message),
            error: isMissingRelation(legacy.error.message)
              ? null
              : legacy.error.message,
          };
        }
        const rows = legacy.data ?? [];
        if (rows.length === 0) {
          return { playlists: [], missingTable: false, error: null };
        }
        const ids = rows.map((r) => r.id as string);
        const countById = new Map<string, number>();
        const { data: trackRows } = await supabase
          .from("playlist_tracks")
          .select("playlist_id")
          .in("playlist_id", ids);
        for (const row of trackRows ?? []) {
          const pid = row.playlist_id as string;
          countById.set(pid, (countById.get(pid) ?? 0) + 1);
        }
        return {
          playlists: rows.map((r) => ({
            id: r.id as string,
            name: (r.name as string)?.trim() || "Playlist",
            description: null,
            cover_art_url: null,
            created_at: (r.created_at as string | null) ?? null,
            updated_at: (r.updated_at as string | null) ?? null,
            track_count: countById.get(r.id as string) ?? 0,
            is_public: false,
          })),
          missingTable: false,
          error: null,
        };
      }
      return { playlists: [], missingTable: false, error: error.message };
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return { playlists: [], missingTable: false, error: null };
    }

    const ids = rows.map((r) => r.id as string);
    const countById = new Map<string, number>();

    const { data: trackRows } = await supabase
      .from("playlist_tracks")
      .select("playlist_id")
      .in("playlist_id", ids);

    for (const row of trackRows ?? []) {
      const pid = row.playlist_id as string;
      countById.set(pid, (countById.get(pid) ?? 0) + 1);
    }

    const playlists: PlaylistSummary[] = rows.map((r) => ({
      id: r.id as string,
      name: (r.name as string)?.trim() || "Playlist",
      description: normalizeDescription(r.description),
      cover_art_url: (typeof r.cover_art_url === "string" && r.cover_art_url.trim()) ? r.cover_art_url.trim() : null,
      created_at: (r.created_at as string | null) ?? null,
      updated_at: (r.updated_at as string | null) ?? null,
      track_count: countById.get(r.id as string) ?? 0,
      is_public: Boolean(r.is_public),
    }));

    return { playlists, missingTable: false, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load playlists";
    return {
      playlists: [],
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
    };
  }
}

export async function loadPlaylistDetail(
  supabase: SupabaseClient,
  userId: string | null,
  playlistId: string,
): Promise<PlaylistDetailResult> {
  try {
    let pl: Record<string, unknown> | null = null;

    {
      const first = await supabase
        .from("playlists")
        .select(
          "id, name, description, cover_art_url, created_at, updated_at, user_id, is_public",
        )
        .eq("id", playlistId)
        .maybeSingle();

      if (first.error) {
        if (isMissingRelation(first.error.message)) {
          return {
            playlist: null,
            missingTable: true,
            error: null,
            notFound: false,
          };
        }
        const missingDesc =
          /description/i.test(first.error.message) &&
          /column .* does not exist/i.test(first.error.message);
        const missingCover =
          /cover_art_url/i.test(first.error.message) &&
          /column .* does not exist/i.test(first.error.message);
        const missingPublic =
          /is_public/i.test(first.error.message) &&
          /column .* does not exist/i.test(first.error.message);

        if (missingCover) {
          const second = await supabase
            .from("playlists")
            .select(
              "id, name, description, created_at, updated_at, user_id, is_public",
            )
            .eq("id", playlistId)
            .maybeSingle();
          if (second.error) {
            if (
              /description/i.test(second.error.message) &&
              /column .* does not exist/i.test(second.error.message)
            ) {
              const third = await supabase
                .from("playlists")
                .select("id, name, created_at, updated_at, user_id, is_public")
                .eq("id", playlistId)
                .maybeSingle();
              if (third.error) {
                return await loadPlaylistDetailLegacy(
                  supabase,
                  userId,
                  playlistId,
                );
              }
              pl = third.data
                ? {
                    ...(third.data as Record<string, unknown>),
                    description: null,
                    cover_art_url: null,
                  }
                : null;
            } else if (/is_public|column .* does not exist/i.test(second.error.message)) {
              return await loadPlaylistDetailLegacy(
                supabase,
                userId,
                playlistId,
              );
            } else {
              return {
                playlist: null,
                missingTable: false,
                error: second.error.message,
                notFound: false,
              };
            }
          } else {
            pl = second.data
              ? {
                  ...(second.data as Record<string, unknown>),
                  cover_art_url: null,
                }
              : null;
          }
        } else if (missingDesc) {
          const second = await supabase
            .from("playlists")
            .select("id, name, created_at, updated_at, user_id, is_public")
            .eq("id", playlistId)
            .maybeSingle();
          if (second.error) {
            if (/is_public|column .* does not exist/i.test(second.error.message)) {
              return await loadPlaylistDetailLegacy(
                supabase,
                userId,
                playlistId,
              );
            }
            return {
              playlist: null,
              missingTable: false,
              error: second.error.message,
              notFound: false,
            };
          }
          pl = second.data
            ? { ...(second.data as Record<string, unknown>), description: null }
            : null;
        } else if (
          missingPublic ||
          /column .* does not exist/i.test(first.error.message)
        ) {
          return await loadPlaylistDetailLegacy(supabase, userId, playlistId);
        } else {
          return {
            playlist: null,
            missingTable: false,
            error: first.error.message,
            notFound: false,
          };
        }
      } else {
        pl = (first.data as Record<string, unknown> | null) ?? null;
      }
    }

    if (!pl) {
      return {
        playlist: null,
        missingTable: false,
        error: null,
        notFound: true,
      };
    }

    const isOwner = Boolean(userId && pl.user_id === userId);
    const isPublic = Boolean(pl.is_public);
    if (!isOwner && !isPublic) {
      return {
        playlist: null,
        missingTable: false,
        error: null,
        notFound: true,
      };
    }

    const { data: links, error: linkError } = await supabase
      .from("playlist_tracks")
      .select("track_id, position, added_at")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: true })
      .order("added_at", { ascending: true });

    if (linkError) {
      return {
        playlist: null,
        missingTable: false,
        error: linkError.message,
        notFound: false,
      };
    }

    const linkRows = links ?? [];
    const trackIds = linkRows.map((r) => r.track_id as string).filter(Boolean);

    let tracks: PlaylistTrack[] = [];
    if (trackIds.length > 0) {
      const { data: trackRows, error: trackError } = await supabase
        .from("tracks")
        .select(
          "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
        )
        .in("id", trackIds);

      if (trackError) {
        return {
          playlist: null,
          missingTable: false,
          error: trackError.message,
          notFound: false,
        };
      }

      const rows = ((trackRows ?? []) as TrackRow[]).filter((t) => {
        if (isDemoTrack(t)) return false;
        return isOwner || isPublishedTrack(t);
      });
      const nameById = await loadArtistCreditMap(
        supabase,
        rows.map((r) => r.artist_id).filter(Boolean) as string[],
      );
      const byId = new Map(
        rows.map((r) => [
          r.id,
          {
            ...r,
            artist_name: r.artist_id
              ? (nameById.get(r.artist_id) ?? null)
              : null,
          },
        ]),
      );

      const linkMeta = new Map(
        linkRows.map((r) => [
          r.track_id as string,
          {
            position: Number(r.position) || 0,
            added_at: (r.added_at as string | null) ?? null,
          },
        ]),
      );

      tracks = [];
      for (const id of trackIds) {
        const t = byId.get(id);
        const meta = linkMeta.get(id);
        if (t && meta) {
          tracks.push({
            ...t,
            position: meta.position,
            added_at: meta.added_at,
          });
        }
      }
    }

    return {
      playlist: {
        id: pl.id as string,
        name: ((pl.name as string) ?? "").trim() || "Playlist",
        description: normalizeDescription(pl.description),
        cover_art_url: (typeof pl.cover_art_url === "string" && pl.cover_art_url.trim()) ? pl.cover_art_url.trim() : null,
        created_at: (pl.created_at as string | null) ?? null,
        updated_at: (pl.updated_at as string | null) ?? null,
        track_count: tracks.length,
        is_public: isPublic,
        is_owner: isOwner,
        tracks,
      },
      missingTable: false,
      error: null,
      notFound: false,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load playlist";
    return {
      playlist: null,
      missingTable: isMissingRelation(msg),
      error: isMissingRelation(msg) ? null : msg,
      notFound: false,
    };
  }
}

/** Pre-migration fallback when is_public column is missing. */
async function loadPlaylistDetailLegacy(
  supabase: SupabaseClient,
  userId: string | null,
  playlistId: string,
): Promise<PlaylistDetailResult> {
  if (!userId) {
    return {
      playlist: null,
      missingTable: false,
      error: "Run 20260808_playlist_public.sql to enable shared playlists",
      notFound: false,
    };
  }

  const { data: pl, error } = await supabase
    .from("playlists")
    .select("id, name, created_at, updated_at, user_id")
    .eq("id", playlistId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        playlist: null,
        missingTable: true,
        error: null,
        notFound: false,
      };
    }
    return {
      playlist: null,
      missingTable: false,
      error: error.message,
      notFound: false,
    };
  }

  if (!pl) {
    return {
      playlist: null,
      missingTable: false,
      error: null,
      notFound: true,
    };
  }

  const { data: links, error: linkError } = await supabase
    .from("playlist_tracks")
    .select("track_id, position, added_at")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: true })
    .order("added_at", { ascending: true });

  if (linkError) {
    return {
      playlist: null,
      missingTable: false,
      error: linkError.message,
      notFound: false,
    };
  }

  const linkRows = links ?? [];
  const trackIds = linkRows.map((r) => r.track_id as string).filter(Boolean);
  let tracks: PlaylistTrack[] = [];

  if (trackIds.length > 0) {
    const { data: trackRows, error: trackError } = await supabase
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
      )
      .in("id", trackIds);

    if (trackError) {
      return {
        playlist: null,
        missingTable: false,
        error: trackError.message,
        notFound: false,
      };
    }

    const rows = ((trackRows ?? []) as TrackRow[]).filter(
      (t) => !isDemoTrack(t) && isPublishedTrack(t),
    );
    const nameById = await loadArtistCreditMap(
      supabase,
      rows.map((r) => r.artist_id).filter(Boolean) as string[],
    );
    const byId = new Map(
      rows.map((r) => [
        r.id,
        {
          ...r,
          artist_name: r.artist_id
            ? (nameById.get(r.artist_id) ?? null)
            : null,
        },
      ]),
    );
    const linkMeta = new Map(
      linkRows.map((r) => [
        r.track_id as string,
        {
          position: Number(r.position) || 0,
          added_at: (r.added_at as string | null) ?? null,
        },
      ]),
    );
    for (const id of trackIds) {
      const t = byId.get(id);
      const meta = linkMeta.get(id);
      if (t && meta) {
        tracks.push({
          ...t,
          position: meta.position,
          added_at: meta.added_at,
        });
      }
    }
  }

  return {
    playlist: {
      id: pl.id as string,
      name: (pl.name as string)?.trim() || "Playlist",
      description: null,
      cover_art_url: null,
      created_at: (pl.created_at as string | null) ?? null,
      updated_at: (pl.updated_at as string | null) ?? null,
      track_count: tracks.length,
      is_public: false,
      is_owner: true,
      tracks,
    },
    missingTable: false,
    error: null,
    notFound: false,
  };
}

export async function createPlaylist(
  supabase: SupabaseClient,
  userId: string,
  name: string,
): Promise<
  | { ok: true; playlist: PlaylistSummary }
  | { ok: false; error: string; code?: "missing_table" | "failed" }
> {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) {
    return { ok: false, error: "Name is required", code: "failed" };
  }

  const { data, error } = await supabase
    .from("playlists")
    .insert({ user_id: userId, name: trimmed })
    .select("id, name, description, cover_art_url, created_at, updated_at, is_public")
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    // Pre-migration: optional columns missing on select
    if (/cover_art_url|description|is_public|column .* does not exist/i.test(error.message)) {
      const retry = await supabase
        .from("playlists")
        .insert({ user_id: userId, name: trimmed })
        .select("id, name, created_at, updated_at")
        .maybeSingle();
      if (retry.error || !retry.data) {
        return {
          ok: false,
          error: retry.error?.message || "Could not create playlist",
          code: "failed",
        };
      }
      return {
        ok: true,
        playlist: {
          id: retry.data.id as string,
          name: (retry.data.name as string)?.trim() || trimmed,
          description: null,
          cover_art_url: null,
          created_at: (retry.data.created_at as string | null) ?? null,
          updated_at: (retry.data.updated_at as string | null) ?? null,
          track_count: 0,
          is_public: false,
        },
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  if (!data) {
    return { ok: false, error: "Could not create playlist", code: "failed" };
  }

  return {
    ok: true,
    playlist: {
      id: data.id as string,
      name: (data.name as string)?.trim() || trimmed,
      description: normalizeDescription(data.description),
      cover_art_url: (typeof data.cover_art_url === "string" && data.cover_art_url.trim()) ? data.cover_art_url.trim() : null,
      created_at: (data.created_at as string | null) ?? null,
      updated_at: (data.updated_at as string | null) ?? null,
      track_count: 0,
      is_public: Boolean(data.is_public),
    },
  };
}

export async function deletePlaylist(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
): Promise<
  | { ok: true }
  | { ok: false; error: string; code?: "missing_table" | "failed" }
> {
  const { error } = await supabase
    .from("playlists")
    .delete()
    .eq("id", playlistId)
    .eq("user_id", userId);

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }
  return { ok: true };
}

export async function renamePlaylist(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
  name: string,
): Promise<
  | { ok: true; name: string }
  | {
      ok: false;
      error: string;
      code?: "missing_table" | "not_found" | "failed";
    }
> {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) {
    return { ok: false, error: "Name is required", code: "failed" };
  }

  const { data, error } = await supabase
    .from("playlists")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", playlistId)
    .eq("user_id", userId)
    .select("id, name")
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  if (!data) {
    return { ok: false, error: "Playlist not found", code: "not_found" };
  }

  return {
    ok: true,
    name: (data.name as string)?.trim() || trimmed,
  };
}

export async function setPlaylistDescription(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
  description: string | null,
): Promise<
  | { ok: true; description: string | null }
  | {
      ok: false;
      error: string;
      code?: "missing_table" | "not_found" | "failed";
    }
> {
  const normalized = normalizeDescription(description ?? "");

  const { data, error } = await supabase
    .from("playlists")
    .update({
      description: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playlistId)
    .eq("user_id", userId)
    .select("id, description")
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (
      /description/i.test(error.message) &&
      /column .* does not exist/i.test(error.message)
    ) {
      return {
        ok: false,
        error: "Run 20260808_playlist_description.sql in Supabase first",
        code: "failed",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  if (!data) {
    return { ok: false, error: "Playlist not found", code: "not_found" };
  }

  return {
    ok: true,
    description: normalizeDescription(data.description),
  };
}

export async function setPlaylistPublic(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
  isPublic: boolean,
): Promise<
  | { ok: true; is_public: boolean }
  | {
      ok: false;
      error: string;
      code?: "missing_table" | "not_found" | "failed";
    }
> {
  const { data, error } = await supabase
    .from("playlists")
    .update({
      is_public: isPublic,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playlistId)
    .eq("user_id", userId)
    .select("id, is_public")
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/is_public|column .* does not exist/i.test(error.message)) {
      return {
        ok: false,
        error: "Run 20260808_playlist_public.sql in Supabase first",
        code: "failed",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  if (!data) {
    return { ok: false, error: "Playlist not found", code: "not_found" };
  }

  return { ok: true, is_public: Boolean(data.is_public) };
}

export async function addTrackToPlaylist(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
  trackId: string,
): Promise<
  | { ok: true; added: boolean }
  | {
      ok: false;
      error: string;
      code?: "missing_table" | "not_found" | "failed";
    }
> {
  const { data: pl, error: plError } = await supabase
    .from("playlists")
    .select("id")
    .eq("id", playlistId)
    .eq("user_id", userId)
    .maybeSingle();

  if (plError) {
    if (isMissingRelation(plError.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: plError.message, code: "failed" };
  }
  if (!pl) {
    return { ok: false, error: "Playlist not found", code: "not_found" };
  }

  const { count } = await supabase
    .from("playlist_tracks")
    .select("track_id", { count: "exact", head: true })
    .eq("playlist_id", playlistId);

  const position = (count ?? 0) + 1;

  const { error } = await supabase.from("playlist_tracks").insert({
    playlist_id: playlistId,
    track_id: trackId,
    position,
  });

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { ok: true, added: false };
    }
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  await supabase
    .from("playlists")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", playlistId)
    .eq("user_id", userId);

  return { ok: true, added: true };
}

export async function removeTrackFromPlaylist(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
  trackId: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?: "missing_table" | "not_found" | "failed";
    }
> {
  const { data: pl, error: plError } = await supabase
    .from("playlists")
    .select("id")
    .eq("id", playlistId)
    .eq("user_id", userId)
    .maybeSingle();

  if (plError) {
    if (isMissingRelation(plError.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: plError.message, code: "failed" };
  }
  if (!pl) {
    return { ok: false, error: "Playlist not found", code: "not_found" };
  }

  const { error } = await supabase
    .from("playlist_tracks")
    .delete()
    .eq("playlist_id", playlistId)
    .eq("track_id", trackId);

  if (error) {
    return { ok: false, error: error.message, code: "failed" };
  }

  await supabase
    .from("playlists")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", playlistId)
    .eq("user_id", userId);

  return { ok: true };
}

export async function reorderPlaylistTracks(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
  trackIds: string[],
): Promise<
  | { ok: true; track_ids: string[] }
  | {
      ok: false;
      error: string;
      code?: "missing_table" | "not_found" | "failed";
    }
> {
  const ordered = trackIds.map((id) => id.trim()).filter(Boolean);
  if (ordered.length === 0) {
    return { ok: false, error: "track_ids required", code: "failed" };
  }
  if (new Set(ordered).size !== ordered.length) {
    return { ok: false, error: "Duplicate track_ids", code: "failed" };
  }

  const { data: pl, error: plError } = await supabase
    .from("playlists")
    .select("id")
    .eq("id", playlistId)
    .eq("user_id", userId)
    .maybeSingle();

  if (plError) {
    if (isMissingRelation(plError.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: plError.message, code: "failed" };
  }
  if (!pl) {
    return { ok: false, error: "Playlist not found", code: "not_found" };
  }

  const { data: links, error: linkError } = await supabase
    .from("playlist_tracks")
    .select("track_id")
    .eq("playlist_id", playlistId);

  if (linkError) {
    if (isMissingRelation(linkError.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: linkError.message, code: "failed" };
  }

  const existing = new Set(
    (links ?? []).map((r) => r.track_id as string).filter(Boolean),
  );
  if (existing.size !== ordered.length) {
    return {
      ok: false,
      error: "track_ids must include every track in the playlist",
      code: "failed",
    };
  }
  for (const id of ordered) {
    if (!existing.has(id)) {
      return {
        ok: false,
        error: "track_ids must match playlist tracks",
        code: "failed",
      };
    }
  }

  for (let i = 0; i < ordered.length; i++) {
    const { error } = await supabase
      .from("playlist_tracks")
      .update({ position: i + 1 })
      .eq("playlist_id", playlistId)
      .eq("track_id", ordered[i]);
    if (error) {
      return { ok: false, error: error.message, code: "failed" };
    }
  }

  await supabase
    .from("playlists")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", playlistId)
    .eq("user_id", userId);

  return { ok: true, track_ids: ordered };
}

export async function movePlaylistTrack(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
  trackId: string,
  direction: "up" | "down",
): Promise<
  | { ok: true; track_ids: string[] }
  | {
      ok: false;
      error: string;
      code?: "missing_table" | "not_found" | "failed";
    }
> {
  const { data: pl, error: plError } = await supabase
    .from("playlists")
    .select("id")
    .eq("id", playlistId)
    .eq("user_id", userId)
    .maybeSingle();

  if (plError) {
    if (isMissingRelation(plError.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: plError.message, code: "failed" };
  }
  if (!pl) {
    return { ok: false, error: "Playlist not found", code: "not_found" };
  }

  const { data: links, error: linkError } = await supabase
    .from("playlist_tracks")
    .select("track_id, position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: true })
    .order("added_at", { ascending: true });

  if (linkError) {
    if (isMissingRelation(linkError.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: linkError.message, code: "failed" };
  }

  const rows = links ?? [];
  const idx = rows.findIndex((r) => (r.track_id as string) === trackId);
  if (idx < 0) {
    return { ok: false, error: "Track not in playlist", code: "not_found" };
  }

  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= rows.length) {
    return {
      ok: true,
      track_ids: rows.map((r) => r.track_id as string),
    };
  }

  const a = rows[idx];
  const b = rows[swapWith];
  const posA = Number(a.position) || idx + 1;
  const posB = Number(b.position) || swapWith + 1;

  // Temp position to avoid rare unique collisions if a unique ever lands on position
  const temp = -1 * (Date.now() % 1_000_000_000);

  const { error: e1 } = await supabase
    .from("playlist_tracks")
    .update({ position: temp })
    .eq("playlist_id", playlistId)
    .eq("track_id", a.track_id as string);
  if (e1) return { ok: false, error: e1.message, code: "failed" };

  const { error: e2 } = await supabase
    .from("playlist_tracks")
    .update({ position: posA })
    .eq("playlist_id", playlistId)
    .eq("track_id", b.track_id as string);
  if (e2) return { ok: false, error: e2.message, code: "failed" };

  const { error: e3 } = await supabase
    .from("playlist_tracks")
    .update({ position: posB })
    .eq("playlist_id", playlistId)
    .eq("track_id", a.track_id as string);
  if (e3) return { ok: false, error: e3.message, code: "failed" };

  const ordered = rows.map((r) => r.track_id as string);
  const tmp = ordered[idx];
  ordered[idx] = ordered[swapWith];
  ordered[swapWith] = tmp;

  await supabase
    .from("playlists")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", playlistId)
    .eq("user_id", userId);

  return { ok: true, track_ids: ordered };
}

/**
 * Copy a playlist you own or any public playlist into a new private playlist
 * under the signed-in user, preserving track order.
 */
export async function duplicatePlaylist(
  supabase: SupabaseClient,
  userId: string,
  sourcePlaylistId: string,
): Promise<
  | { ok: true; playlist: PlaylistSummary }
  | {
      ok: false;
      error: string;
      code?: "missing_table" | "not_found" | "failed";
    }
> {
  const detail = await loadPlaylistDetail(supabase, userId, sourcePlaylistId);
  if (detail.missingTable) {
    return {
      ok: false,
      error: "Run playlists SQL in Supabase first",
      code: "missing_table",
    };
  }
  if (detail.error) {
    return { ok: false, error: detail.error, code: "failed" };
  }
  if (!detail.playlist) {
    return { ok: false, error: "Playlist not found", code: "not_found" };
  }

  const source = detail.playlist;
  const baseName = source.name.trim() || "Playlist";
  const copyLabel = source.is_owner ? `${baseName} (copy)` : baseName;
  const name = copyLabel.slice(0, 80);

  const created = await createPlaylist(supabase, userId, name);
  if (!created.ok) {
    return created;
  }

  let playlist = created.playlist;
  if (source.description) {
    const desc = await setPlaylistDescription(
      supabase,
      userId,
      playlist.id,
      source.description,
    );
    if (desc.ok) {
      playlist = { ...playlist, description: desc.description };
    }
  }

  const trackIds = source.tracks.map((t) => t.id).filter(Boolean);
  if (trackIds.length === 0) {
    return { ok: true, playlist };
  }

  const rows = trackIds.map((track_id, i) => ({
    playlist_id: created.playlist.id,
    track_id,
    position: i + 1,
  }));

  const { error: insertError } = await supabase
    .from("playlist_tracks")
    .insert(rows);

  if (insertError) {
    await supabase
      .from("playlists")
      .delete()
      .eq("id", created.playlist.id)
      .eq("user_id", userId);
    if (isMissingRelation(insertError.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: insertError.message, code: "failed" };
  }

  await supabase
    .from("playlists")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", created.playlist.id)
    .eq("user_id", userId);

  return {
    ok: true,
    playlist: {
      ...playlist,
      track_count: trackIds.length,
    },
  };
}

export async function createPlaylistFromTrackIds(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  trackIds: string[],
): Promise<
  | { ok: true; playlist: PlaylistSummary }
  | {
      ok: false;
      error: string;
      code?: "missing_table" | "failed";
    }
> {
  const created = await createPlaylist(supabase, userId, name);
  if (!created.ok) {
    return created;
  }

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of trackIds) {
    const tid = typeof id === "string" ? id.trim() : "";
    if (!tid || seen.has(tid)) continue;
    seen.add(tid);
    ordered.push(tid);
  }

  if (ordered.length === 0) {
    return { ok: true, playlist: created.playlist };
  }

  const rows = ordered.map((track_id, i) => ({
    playlist_id: created.playlist.id,
    track_id,
    position: i + 1,
  }));

  const { error: insertError } = await supabase
    .from("playlist_tracks")
    .insert(rows);

  if (insertError) {
    await supabase
      .from("playlists")
      .delete()
      .eq("id", created.playlist.id)
      .eq("user_id", userId);
    if (isMissingRelation(insertError.message)) {
      return {
        ok: false,
        error: "Run playlists SQL in Supabase first",
        code: "missing_table",
      };
    }
    return { ok: false, error: insertError.message, code: "failed" };
  }

  await supabase
    .from("playlists")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", created.playlist.id)
    .eq("user_id", userId);

  return {
    ok: true,
    playlist: {
      ...created.playlist,
      track_count: ordered.length,
    },
  };
}
