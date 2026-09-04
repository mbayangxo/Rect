import type { SupabaseClient } from "@supabase/supabase-js";
import { CULTURAL_LANGUAGES } from "@/lib/cultural-options";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { loadLikeCountMap } from "@/lib/dashboard/likes";
import type { ListenerTaste } from "@/lib/dashboard/taste";
import {
  isDemoTrack,
  isPublishedTrack,
  withLiveCatalogTracks,
  type TrackRow,
} from "@/lib/tracks";

export type LanguageHub = {
  slug: string;
  name: string;
  track_count: number;
  for_you: boolean;
};

export type LanguageTrack = TrackRow & {
  artist_name: string | null;
  like_count: number;
};

function normalizeLanguageName(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

export function languageToSlug(name: string) {
  return normalizeLanguageName(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function languagesMatch(a: string, b: string) {
  return languageToSlug(a) === languageToSlug(b);
}

/**
 * Resolve ?language= from slug or display name to a canonical label.
 * Returns null when empty / unusable.
 */
export function resolveLanguageParam(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  const slug = languageToSlug(t);
  if (!slug) return null;

  // Prefer catalog spelling when it matches a known cultural language
  for (const name of CULTURAL_LANGUAGES) {
    if (languageToSlug(name) === slug) return name;
  }

  // Free-text / hub name: title-case-ish from slug words
  if (t.includes("-") || t === slug) {
    return slug
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return normalizeLanguageName(t);
}

export function trackMatchesLanguage(
  trackLanguage: string | null | undefined,
  filter: string | null | undefined,
) {
  if (!filter) return true;
  if (!trackLanguage) return false;
  return languagesMatch(trackLanguage, filter);
}

/**
 * Language hubs from published catalog tracks.
 */
export async function loadLanguageHubs(
  supabase: SupabaseClient,
  taste?: ListenerTaste | null,
): Promise<{ hubs: LanguageHub[]; error: string | null }> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data, error } = await withLiveCatalogTracks(
      db.from("tracks").select("id, title, language, status"),
    )
      .order("created_at", { ascending: false })
      .limit(400);

    if (error && /content_kind|language|column .* does not exist/i.test(error.message)) {
      if (/content_kind/i.test(error.message)) {
        const lean = await withLiveCatalogTracks(
          db.from("tracks").select("id, title, language, status"),
          { includePodcasts: true },
        )
          .order("created_at", { ascending: false })
          .limit(400);
        if (lean.error && /language|column .* does not exist/i.test(lean.error.message)) {
          return {
            hubs: [],
            error: "Run 20260809_tracks_language.sql to unlock language hubs.",
          };
        }
        if (lean.error) return { hubs: [], error: lean.error.message };
        const rows = ((lean.data ?? []) as TrackRow[]).filter(
          (t) => isPublishedTrack(t) && !isDemoTrack(t),
        );
        const counts = new Map<string, { name: string; count: number }>();
        for (const t of rows) {
          const name =
            typeof t.language === "string" ? normalizeLanguageName(t.language) : "";
          if (!name) continue;
          const slug = languageToSlug(name);
          if (!slug) continue;
          const prev = counts.get(slug);
          if (prev) prev.count += 1;
          else counts.set(slug, { name, count: 1 });
        }
        // fall through using rebuilt hubs from lean — handled below via early return pattern
        const hubs = [...counts.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, 40)
          .map((h) => ({
            slug: languageToSlug(h.name),
            name: h.name,
            track_count: h.count,
            for_you: false,
          }));
        return { hubs, error: null };
      }
      return {
        hubs: [],
        error: "Run 20260809_tracks_language.sql to unlock language hubs.",
      };
    }

    if (error) {
      return { hubs: [], error: error.message };
    }

    const rows = ((data ?? []) as TrackRow[]).filter(
      (t) => isPublishedTrack(t) && !isDemoTrack(t),
    );

    const counts = new Map<string, { name: string; count: number }>();
    for (const t of rows) {
      const name =
        typeof t.language === "string" ? normalizeLanguageName(t.language) : "";
      if (!name) continue;
      const slug = languageToSlug(name);
      if (!slug) continue;
      const prev = counts.get(slug);
      if (prev) {
        prev.count += 1;
      } else {
        counts.set(slug, { name, count: 1 });
      }
    }

    const tasteSlugs = new Set(
      (taste?.languages ?? []).map((l) => languageToSlug(l)).filter(Boolean),
    );

    const hubs: LanguageHub[] = [...counts.entries()]
      .map(([slug, v]) => ({
        slug,
        name: v.name,
        track_count: v.count,
        for_you: tasteSlugs.has(slug),
      }))
      .sort(
        (a, b) =>
          Number(b.for_you) - Number(a.for_you) ||
          b.track_count - a.track_count ||
          a.name.localeCompare(b.name),
      );

    return { hubs, error: null };
  } catch (e) {
    return {
      hubs: [],
      error: e instanceof Error ? e.message : "Failed to load languages",
    };
  }
}

export async function loadLanguageTracks(
  supabase: SupabaseClient,
  slug: string,
  limit = 40,
): Promise<{
  languageName: string | null;
  tracks: LanguageTrack[];
  error: string | null;
  notFound: boolean;
}> {
  const cleanSlug = languageToSlug(slug);
  if (!cleanSlug) {
    return { languageName: null, tracks: [], error: null, notFound: true };
  }

  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;

    const { data, error } = await withLiveCatalogTracks(
      db
        .from("tracks")
        .select(
          "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at",
        ),
    )
      .order("created_at", { ascending: false })
      .limit(300);

    let langData = data;
    let langError = error;
    if (error && /content_kind/i.test(error.message)) {
      const lean = await withLiveCatalogTracks(
        db
          .from("tracks")
          .select(
            "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at",
          ),
        { includePodcasts: true },
      )
        .order("created_at", { ascending: false })
        .limit(300);
      langData = lean.data;
      langError = lean.error;
    }

    if (langError && /language|column .* does not exist/i.test(langError.message)) {
      return {
        languageName: null,
        tracks: [],
        error: "Run 20260809_tracks_language.sql to unlock language hubs.",
        notFound: false,
      };
    }

    if (langError) {
      return {
        languageName: null,
        tracks: [],
        error: langError.message,
        notFound: false,
      };
    }

    const matched = ((langData ?? []) as TrackRow[]).filter((t) => {
      if (!isPublishedTrack(t) || isDemoTrack(t)) return false;
      const lang = typeof t.language === "string" ? t.language : "";
      return languagesMatch(lang, cleanSlug);
    });

    if (matched.length === 0) {
      return {
        languageName: null,
        tracks: [],
        error: null,
        notFound: true,
      };
    }

    const languageName =
      normalizeLanguageName(matched[0].language || cleanSlug) || cleanSlug;

    const sliced = matched.slice(0, limit);
    const artistIds = [
      ...new Set(sliced.map((t) => t.artist_id).filter(Boolean) as string[]),
    ];
    const nameById = await loadArtistCreditMap(db, artistIds);
    const likes = await loadLikeCountMap(
      db,
      sliced.map((t) => t.id),
    );

    const tracks: LanguageTrack[] = sliced.map((t) => ({
      ...t,
      artist_name: t.artist_id
        ? (nameById.get(t.artist_id) ?? null)
        : null,
      like_count: likes.get(t.id) ?? 0,
    }));

    return { languageName, tracks, error: null, notFound: false };
  } catch (e) {
    return {
      languageName: null,
      tracks: [],
      error: e instanceof Error ? e.message : "Failed to load language",
      notFound: false,
    };
  }
}
