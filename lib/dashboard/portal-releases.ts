import type { SupabaseClient } from "@supabase/supabase-js";

export type PortalRelease = {
  id: string;
  artistId: string;
  title: string;
  slug: string | null;
  kind: string;
  description: string | null;
  coverUrl: string | null;
  themeColor: string;
  portalAudioUrl: string | null;
  trackId: string | null;
  published: boolean;
  sortOrder: number;
  media: PortalReleaseMedia[];
};

export type PortalReleaseMedia = {
  id: number;
  releaseId: string;
  kind: "photo" | "video";
  url: string;
  caption: string | null;
  sortOrder: number;
};

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205/i.test(
    message,
  );
}

export async function loadPortalReleases(
  supabase: SupabaseClient,
  artistId: string,
  options?: { publishedOnly?: boolean },
): Promise<{ releases: PortalRelease[]; ready: boolean; error: string | null }> {
  try {
    let q = supabase
      .from("portal_releases")
      .select(
        "id, artist_id, title, slug, kind, description, cover_url, theme_color, portal_audio_url, track_id, published, sort_order",
      )
      .eq("artist_id", artistId)
      .order("sort_order", { ascending: true });

    if (options?.publishedOnly) {
      q = q.eq("published", true);
    }

    const { data, error } = await q;
    if (error) {
      if (isMissingRelation(error.message)) {
        return { releases: [], ready: false, error: null };
      }
      return { releases: [], ready: false, error: error.message };
    }

    const releaseIds = (data ?? []).map((r) => String(r.id));
    const mediaByRelease = new Map<string, PortalReleaseMedia[]>();

    if (releaseIds.length > 0) {
      const { data: mediaRows } = await supabase
        .from("portal_release_media")
        .select("id, release_id, kind, url, caption, sort_order")
        .in("release_id", releaseIds)
        .order("sort_order", { ascending: true });

      for (const m of mediaRows ?? []) {
        const rid = String(m.release_id);
        const list = mediaByRelease.get(rid) ?? [];
        list.push({
          id: Number(m.id),
          releaseId: rid,
          kind: m.kind === "video" ? "video" : "photo",
          url: String(m.url),
          caption: typeof m.caption === "string" ? m.caption : null,
          sortOrder: Number(m.sort_order) || 0,
        });
        mediaByRelease.set(rid, list);
      }
    }

    const releases: PortalRelease[] = (data ?? []).map((r) => ({
      id: String(r.id),
      artistId: String(r.artist_id),
      title: String(r.title),
      slug: typeof r.slug === "string" ? r.slug : null,
      kind: String(r.kind ?? "release"),
      description:
        typeof r.description === "string" ? r.description : null,
      coverUrl: typeof r.cover_url === "string" ? r.cover_url : null,
      themeColor:
        typeof r.theme_color === "string" ? r.theme_color : "#1DB954",
      portalAudioUrl:
        typeof r.portal_audio_url === "string" ? r.portal_audio_url : null,
      trackId: typeof r.track_id === "string" ? r.track_id : null,
      published: Boolean(r.published),
      sortOrder: Number(r.sort_order) || 0,
      media: mediaByRelease.get(String(r.id)) ?? [],
    }));

    return { releases, ready: true, error: null };
  } catch (e) {
    return {
      releases: [],
      ready: false,
      error: e instanceof Error ? e.message : "Failed to load portal releases",
    };
  }
}

export async function loadPortalReleaseById(
  supabase: SupabaseClient,
  releaseId: string,
): Promise<PortalRelease | null> {
  const { data, error } = await supabase
    .from("portal_releases")
    .select(
      "id, artist_id, title, slug, kind, description, cover_url, theme_color, portal_audio_url, track_id, published, sort_order",
    )
    .eq("id", releaseId)
    .maybeSingle();

  if (error || !data) return null;

  const { data: mediaRows } = await supabase
    .from("portal_release_media")
    .select("id, release_id, kind, url, caption, sort_order")
    .eq("release_id", releaseId)
    .order("sort_order", { ascending: true });

  return {
    id: String(data.id),
    artistId: String(data.artist_id),
    title: String(data.title),
    slug: typeof data.slug === "string" ? data.slug : null,
    kind: String(data.kind ?? "release"),
    description:
      typeof data.description === "string" ? data.description : null,
    coverUrl: typeof data.cover_url === "string" ? data.cover_url : null,
    themeColor:
      typeof data.theme_color === "string" ? data.theme_color : "#1DB954",
    portalAudioUrl:
      typeof data.portal_audio_url === "string"
        ? data.portal_audio_url
        : null,
    trackId: typeof data.track_id === "string" ? data.track_id : null,
    published: Boolean(data.published),
    sortOrder: Number(data.sort_order) || 0,
    media: (mediaRows ?? []).map((m) => ({
      id: Number(m.id),
      releaseId: String(m.release_id),
      kind: m.kind === "video" ? "video" : "photo",
      url: String(m.url),
      caption: typeof m.caption === "string" ? m.caption : null,
      sortOrder: Number(m.sort_order) || 0,
    })),
  };
}

export async function savePortalRelease(
  supabase: SupabaseClient,
  artistId: string,
  input: {
    id?: string;
    title: string;
    kind?: string;
    description?: string;
    coverUrl?: string | null;
    themeColor?: string;
    portalAudioUrl?: string | null;
    trackId?: string | null;
    published?: boolean;
    sortOrder?: number;
  },
): Promise<{ ok: true; release: PortalRelease } | { ok: false; error: string }> {
  const row = {
    artist_id: artistId,
    title: input.title.trim(),
    kind: input.kind ?? "release",
    description: input.description?.trim() || null,
    cover_url: input.coverUrl ?? null,
    theme_color: input.themeColor ?? "#1DB954",
    portal_audio_url: input.portalAudioUrl ?? null,
    track_id: input.trackId ?? null,
    published: input.published ?? false,
    sort_order: input.sortOrder ?? 0,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("portal_releases")
      .update(row)
      .eq("id", input.id)
      .eq("artist_id", artistId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Update failed" };
    }
    const release = await loadPortalReleaseById(supabase, String(data.id));
    if (!release) return { ok: false, error: "Release not found after save" };
    return { ok: true, release };
  }

  const { data, error } = await supabase
    .from("portal_releases")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Create failed" };
  }
  const release = await loadPortalReleaseById(supabase, String(data.id));
  if (!release) return { ok: false, error: "Release not found after create" };
  return { ok: true, release };
}

export async function addPortalReleaseMedia(
  supabase: SupabaseClient,
  artistId: string,
  releaseId: string,
  input: { kind: "photo" | "video"; url: string; caption?: string },
): Promise<{ ok: true; media: PortalReleaseMedia } | { ok: false; error: string }> {
  const { data: release } = await supabase
    .from("portal_releases")
    .select("id")
    .eq("id", releaseId)
    .eq("artist_id", artistId)
    .maybeSingle();

  if (!release) return { ok: false, error: "Release not found" };

  const { data, error } = await supabase
    .from("portal_release_media")
    .insert({
      release_id: releaseId,
      kind: input.kind,
      url: input.url.trim(),
      caption: input.caption?.trim() || null,
    })
    .select("id, release_id, kind, url, caption, sort_order")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not add media" };
  }

  return {
    ok: true,
    media: {
      id: Number(data.id),
      releaseId: String(data.release_id),
      kind: data.kind === "video" ? "video" : "photo",
      url: String(data.url),
      caption: typeof data.caption === "string" ? data.caption : null,
      sortOrder: Number(data.sort_order) || 0,
    },
  };
}
