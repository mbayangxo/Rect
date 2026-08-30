import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { artistMatchesPlaces, placeOverlapScore } from "@/lib/dashboard/charts";
import { trackMatchesGenre } from "@/lib/dashboard/genres";
import { trackMatchesLanguage } from "@/lib/dashboard/languages";
import { placeToSlug } from "@/lib/dashboard/places";
import {
  activeDaypartFromTaste,
  daypartSoftScore,
  DAYPART_META,
  genreOverlapScore,
  languageOverlapScore,
  normalizeGenreKey,
  normalizeTasteList,
  type DaypartId,
  type ListenerTaste,
} from "@/lib/dashboard/taste";
import {
  isDemoTrack,
  isPublishedTrack,
  withLiveCatalogTracks,
  type TrackRow,
} from "@/lib/tracks";

export type RadioStation = {
  id: string;
  label: string;
  subtitle: string;
  genre: string | null;
  place: string | null;
  language: string | null;
  daypart: string | null;
  tracks: TrackRow[];
  forYou: boolean;
};

export type RadioLoadResult = {
  stations: RadioStation[];
  error: string | null;
};

const FALLBACK_GENRES = [
  "Afrobeats",
  "Amapiano",
  "Mbalax",
  "Afrohouse",
  "Hip-Hop",
];

async function loadArtistCountriesMap(
  db: SupabaseClient,
  artistIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (artistIds.length === 0) return map;

  const { data, error } = await db
    .from("users")
    .select("id, countries")
    .in("id", artistIds);

  if (error || !data) return map;
  for (const row of data) {
    map.set(row.id as string, normalizeTasteList(row.countries));
  }
  return map;
}

/**
 * Build Wave stations from live catalog tracks.
 * Prefer listener taste places, languages, genres, and current daypart.
 * Flagship station is always "Your Wave" / "The Wave".
 */
export async function loadRadioStations(
  supabase: SupabaseClient,
  taste?: ListenerTaste | null,
  language?: string | null,
  genre?: string | null,
  place?: string | null,
): Promise<RadioLoadResult> {
  try {
    const admin = createAdminClient();
    const db = admin ?? supabase;
    const languageFilter = language?.trim() || null;
    const genreFilter = genre?.trim() || null;
    const placeFilter = place?.trim() || null;

    const { data, error } = await withLiveCatalogTracks(
      db
        .from("tracks")
        .select(
          "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at",
        ),
    )
      .order("created_at", { ascending: false })
      .limit(120);

    let trackData = data;
    let trackError = error;
    if (
      error &&
      /language|column .* does not exist/i.test(error.message)
    ) {
      const lean = await withLiveCatalogTracks(
        db
          .from("tracks")
          .select(
            "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
          ),
      )
        .order("created_at", { ascending: false })
        .limit(120);
      trackData = lean.data as typeof trackData;
      trackError = lean.error;
    }

    if (trackError) {
      return { stations: [], error: trackError.message };
    }

    const rows = ((trackData ?? []) as TrackRow[]).filter(
      (t) =>
        isPublishedTrack(t) &&
        !isDemoTrack(t) &&
        Boolean(t.audio_url) &&
        trackMatchesLanguage(t.language, languageFilter) &&
        trackMatchesGenre(t.genre, genreFilter),
    );

    const artistIds = [
      ...new Set(rows.map((r) => r.artist_id).filter(Boolean) as string[]),
    ];
    const [nameById, countriesByArtist] = await Promise.all([
      loadArtistCreditMap(db, artistIds),
      loadArtistCountriesMap(db, artistIds),
    ]);

    const filtered = placeFilter
      ? rows.filter((t) => {
          if (!t.artist_id) return false;
          return artistMatchesPlaces(
            countriesByArtist.get(t.artist_id) ?? [],
            [placeFilter],
          );
        })
      : rows;

    const tracks = filtered.map((r) => ({
      ...r,
      artist_name: r.artist_id ? (nameById.get(r.artist_id) ?? null) : null,
    }));

    const preferredGenres = taste?.genres ?? [];
    const preferredPlaces = taste?.countries ?? [];
    const preferredLanguages = taste?.languages ?? [];
    const activeDaypart = activeDaypartFromTaste(taste);
    const catalogGenres = [
      ...new Set(
        tracks
          .map((t) => t.genre?.trim())
          .filter((g): g is string => Boolean(g)),
      ),
    ];

    type StationSeed = {
      kind: "place" | "genre" | "language" | "daypart";
      label: string;
      forYou: boolean;
      daypartId?: string;
    };

    const seeds: StationSeed[] = [];
    const seen = new Set<string>();

    if (activeDaypart) {
      const meta = DAYPART_META[activeDaypart];
      seeds.push({
        kind: "daypart",
        label: meta.label,
        forYou: true,
        daypartId: activeDaypart,
      });
      seen.add(`daypart:${activeDaypart}`);
    }

    for (const place of preferredPlaces) {
      const key = `place:${placeToSlug(place)}`;
      if (!key.endsWith(":") && !seen.has(key)) {
        seen.add(key);
        seeds.push({ kind: "place", label: place, forYou: true });
      }
    }
    for (const lang of preferredLanguages) {
      const key = `lang:${normalizeGenreKey(lang)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({ kind: "language", label: lang, forYou: true });
    }
    for (const g of preferredGenres) {
      const key = `genre:${normalizeGenreKey(g)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({ kind: "genre", label: g, forYou: true });
    }
    for (const g of catalogGenres) {
      if (seeds.length >= 10) break;
      const key = `genre:${normalizeGenreKey(g)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({ kind: "genre", label: g, forYou: false });
    }
    for (const g of FALLBACK_GENRES) {
      if (seeds.length >= 8) break;
      const key = `genre:${normalizeGenreKey(g)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({ kind: "genre", label: g, forYou: false });
    }

    const stations: RadioStation[] = seeds
      .map((s, i) => {
        let matched: TrackRow[];
        if (s.kind === "daypart") {
          const daypartId = (s.daypartId || activeDaypart || "evening") as DaypartId;
          matched = [...tracks]
            .sort((a, b) => {
              const softA = daypartSoftScore(daypartId, a);
              const softB = daypartSoftScore(daypartId, b);
              const genreA = genreOverlapScore([a.genre], preferredGenres);
              const genreB = genreOverlapScore([b.genre], preferredGenres);
              const langA = languageOverlapScore(
                [a.language],
                preferredLanguages,
              );
              const langB = languageOverlapScore(
                [b.language],
                preferredLanguages,
              );
              return (
                softB - softA ||
                genreB - genreA ||
                langB - langA ||
                (b.created_at || "").localeCompare(a.created_at || "")
              );
            })
            .slice(0, 16);
        } else if (s.kind === "place") {
          matched = tracks
            .filter((t) => {
              if (!t.artist_id) return false;
              return artistMatchesPlaces(
                countriesByArtist.get(t.artist_id) ?? [],
                [s.label],
              );
            })
            .sort((a, b) => {
              const placeA = placeOverlapScore(
                a.artist_id
                  ? (countriesByArtist.get(a.artist_id) ?? [])
                  : [],
                preferredPlaces,
              );
              const placeB = placeOverlapScore(
                b.artist_id
                  ? (countriesByArtist.get(b.artist_id) ?? [])
                  : [],
                preferredPlaces,
              );
              const langA = languageOverlapScore(
                [a.language],
                preferredLanguages,
              );
              const langB = languageOverlapScore(
                [b.language],
                preferredLanguages,
              );
              return (
                placeB - placeA ||
                langB - langA ||
                (b.created_at || "").localeCompare(a.created_at || "")
              );
            })
            .slice(0, 12);
        } else if (s.kind === "language") {
          matched = tracks
            .filter((t) => languageOverlapScore([t.language], [s.label]) > 0)
            .sort((a, b) => {
              const genreA = genreOverlapScore([a.genre], preferredGenres);
              const genreB = genreOverlapScore([b.genre], preferredGenres);
              return (
                genreB - genreA ||
                (b.created_at || "").localeCompare(a.created_at || "")
              );
            })
            .slice(0, 12);
        } else {
          matched = tracks
            .filter(
              (t) =>
                genreOverlapScore([t.genre], [s.label]) > 0 ||
                (!t.genre && s.forYou && i === 0),
            )
            .sort((a, b) => {
              const langA = languageOverlapScore(
                [a.language],
                preferredLanguages,
              );
              const langB = languageOverlapScore(
                [b.language],
                preferredLanguages,
              );
              return (
                langB - langA ||
                (b.created_at || "").localeCompare(a.created_at || "")
              );
            })
            .slice(0, 12);
        }

        const playlist =
          matched.length > 0
            ? matched
            : s.forYou
              ? tracks.slice(i * 3, i * 3 + 8).filter(Boolean)
              : [];

        if (playlist.length === 0) return null;

        const slug =
          s.kind === "place"
            ? placeToSlug(s.label)
            : s.kind === "daypart"
              ? s.daypartId || normalizeGenreKey(s.label)
              : normalizeGenreKey(s.label).replace(/\s+/g, "-");

        const daypartMeta =
          s.kind === "daypart" && s.daypartId
            ? DAYPART_META[s.daypartId as keyof typeof DAYPART_META]
            : null;

        return {
          id: `station-${s.kind}-${slug}`,
          label: s.label,
          subtitle:
            s.kind === "daypart"
              ? daypartMeta
                ? `Soft-ranked for now · ${daypartMeta.energy}`
                : "Soft-ranked for your listening time"
              : s.kind === "place"
                ? s.forYou
                  ? "Your place · artists from here"
                  : `${playlist.length} tracks`
                : s.kind === "language"
                  ? s.forYou
                    ? "In your language"
                    : `${playlist.length} tracks`
                  : s.forYou
                    ? "Tuned to your taste"
                    : `${playlist.length} tracks`,
          genre: s.kind === "genre" ? s.label : null,
          place: s.kind === "place" ? s.label : null,
          language: s.kind === "language" ? s.label : null,
          daypart: s.kind === "daypart" ? s.daypartId || s.label : null,
          tracks: playlist,
          forYou: s.forYou,
        } satisfies RadioStation;
      })
      .filter((s): s is RadioStation => Boolean(s))
      .slice(0, 8);

    if (tracks.length > 0) {
      const hasTaste =
        preferredGenres.length > 0 ||
        preferredPlaces.length > 0 ||
        preferredLanguages.length > 0 ||
        Boolean(activeDaypart);

      const waveTracks = [...tracks]
        .sort((a, b) => {
          const placeA = placeOverlapScore(
            a.artist_id ? (countriesByArtist.get(a.artist_id) ?? []) : [],
            preferredPlaces,
          );
          const placeB = placeOverlapScore(
            b.artist_id ? (countriesByArtist.get(b.artist_id) ?? []) : [],
            preferredPlaces,
          );
          const genreA = genreOverlapScore([a.genre], preferredGenres);
          const genreB = genreOverlapScore([b.genre], preferredGenres);
          const langA = languageOverlapScore(
            [a.language],
            preferredLanguages,
          );
          const langB = languageOverlapScore(
            [b.language],
            preferredLanguages,
          );
          const dayA = activeDaypart ? daypartSoftScore(activeDaypart, a) : 0;
          const dayB = activeDaypart ? daypartSoftScore(activeDaypart, b) : 0;
          return (
            placeB - placeA ||
            genreB - genreA ||
            langB - langA ||
            dayB - dayA ||
            (b.created_at || "").localeCompare(a.created_at || "")
          );
        })
        .slice(0, 24);

      stations.unshift({
        id: "station-wave",
        label: hasTaste ? "Your Wave" : "The Wave",
        subtitle: hasTaste
          ? "Continuous mix from your places, languages, times & genres"
          : "Live catalog signal · keep listening",
        genre: null,
        place: null,
        language: null,
        daypart: activeDaypart,
        tracks: waveTracks,
        forYou: hasTaste,
      });
    }

    return { stations: stations.slice(0, 9), error: null };
  } catch (e) {
    return {
      stations: [],
      error: e instanceof Error ? e.message : "Failed to load radio",
    };
  }
}
