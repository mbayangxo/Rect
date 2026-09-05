import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadListenerTaste,
  normalizeTasteList,
  type ListenerTaste,
} from "@/lib/dashboard/taste";

export type AffinityItem = { name: string; score: number };

export type BehaviorAffinity = {
  ok: boolean;
  window_days: number;
  play_count: number;
  like_count: number;
  genres: AffinityItem[];
  languages: AffinityItem[];
  countries: AffinityItem[];
  listening_times: AffinityItem[];
  artists: { id: string; score: number }[];
  degraded?: boolean;
  missingRpc?: boolean;
};

export type ListenerTasteResolved = ListenerTaste & {
  /** declared = onboarding only; behavior = plays/likes only; merged = both */
  source: "declared" | "behavior" | "merged";
  behaviorPlayCount: number;
  behaviorLikeCount: number;
};

function parseItems(raw: unknown): AffinityItem[] {
  if (!Array.isArray(raw)) return [];
  const out: AffinityItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const score = Number(r.score);
    if (!name || !Number.isFinite(score) || score <= 0) continue;
    out.push({ name, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

function emptyAffinity(missingRpc = false): BehaviorAffinity {
  return {
    ok: true,
    window_days: 90,
    play_count: 0,
    like_count: 0,
    genres: [],
    languages: [],
    countries: [],
    listening_times: [],
    artists: [],
    missingRpc,
  };
}

/**
 * Load play/like-derived affinity for the signed-in user.
 * Prefers RPC listener_behavior_affinity; falls back to a light client rollup.
 */
export async function loadBehaviorAffinity(
  supabase: SupabaseClient,
  days = 90,
): Promise<BehaviorAffinity> {
  const { data, error } = await supabase.rpc("listener_behavior_affinity", {
    p_days: days,
  });

  if (!error && data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    if (row.ok === false) return emptyAffinity();
    const artistsRaw = Array.isArray(row.artists) ? row.artists : [];
    return {
      ok: true,
      window_days: Number(row.window_days) || days,
      play_count: Number(row.play_count) || 0,
      like_count: Number(row.like_count) || 0,
      genres: parseItems(row.genres),
      languages: parseItems(row.languages),
      countries: parseItems(row.countries),
      listening_times: parseItems(row.listening_times),
      artists: artistsRaw
        .map((a) => {
          if (!a || typeof a !== "object") return null;
          const r = a as Record<string, unknown>;
          const id = typeof r.id === "string" ? r.id : "";
          const score = Number(r.score);
          if (!id || !Number.isFinite(score)) return null;
          return { id, score };
        })
        .filter((x): x is { id: string; score: number } => Boolean(x)),
      degraded: Boolean(row.degraded),
    };
  }

  if (
    error &&
    /listener_behavior_affinity|function .* does not exist|PGRST202/i.test(
      error.message,
    )
  ) {
    return loadBehaviorAffinityFallback(supabase, days);
  }

  if (error) {
    return emptyAffinity(true);
  }

  return emptyAffinity();
}

/** Client-side rollup when RPC migration not applied yet. */
async function loadBehaviorAffinityFallback(
  supabase: SupabaseClient,
  days: number,
): Promise<BehaviorAffinity> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyAffinity(true);

  const since = new Date(Date.now() - days * 86400000).toISOString();
  const genreW = new Map<string, number>();
  const langW = new Map<string, number>();
  const timeW = new Map<string, number>();

  const { data: plays, error: playErr } = await supabase
    .from("plays")
    .select("created_at, listened_secs, track_id")
    .eq("listener_id", user.id)
    .gte("created_at", since)
    .limit(400);

  if (playErr) return emptyAffinity(true);

  const playRows = plays ?? [];
  const trackIds = [
    ...new Set(
      playRows
        .map((p) => p.track_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const trackMeta = new Map<
    string,
    { genre: string | null; language: string | null; content_kind: string | null }
  >();
  if (trackIds.length > 0) {
    let { data: tracks, error: trackErr } = await supabase
      .from("tracks")
      .select("id, genre, language, content_kind")
      .in("id", trackIds.slice(0, 200));
    if (
      trackErr &&
      /content_kind|column .* does not exist/i.test(trackErr.message)
    ) {
      const lean = await supabase
        .from("tracks")
        .select("id, genre, language")
        .in("id", trackIds.slice(0, 200));
      tracks = lean.data as typeof tracks;
      trackErr = lean.error;
    }
    if (!trackErr) {
      for (const t of tracks ?? []) {
        trackMeta.set(t.id as string, {
          genre: (t.genre as string | null) ?? null,
          language: (t.language as string | null) ?? null,
          content_kind:
            (t as { content_kind?: string | null }).content_kind ?? null,
        });
      }
    }
  }

  function daypartFromIso(iso: string): string {
    const h = new Date(iso).getUTCHours();
    if (h >= 5 && h < 12) return "morning";
    if (h >= 12 && h < 17) return "afternoon";
    if (h >= 17 && h < 21) return "evening";
    return "night";
  }

  for (const p of playRows) {
    const meta = trackMeta.get(p.track_id as string);
    if (!meta || meta.content_kind === "podcast") continue;
    const w = Math.max(1, (Number(p.listened_secs) || 30) / 30);
    if (meta.genre?.trim()) {
      const g = meta.genre.trim();
      genreW.set(g, (genreW.get(g) ?? 0) + w);
    }
    if (meta.language?.trim()) {
      const l = meta.language.trim();
      langW.set(l, (langW.get(l) ?? 0) + w);
    }
    if (typeof p.created_at === "string") {
      const d = daypartFromIso(p.created_at);
      timeW.set(d, (timeW.get(d) ?? 0) + w);
    }
  }

  const { data: likes } = await supabase
    .from("track_likes")
    .select("track_id, created_at")
    .eq("user_id", user.id)
    .gte("created_at", since)
    .limit(200);

  const likeRows = likes ?? [];
  const likeTrackIds = [
    ...new Set(
      likeRows
        .map((l) => l.track_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ].filter((id) => !trackMeta.has(id));

  if (likeTrackIds.length > 0) {
    let { data: more, error: moreErr } = await supabase
      .from("tracks")
      .select("id, genre, language, content_kind")
      .in("id", likeTrackIds.slice(0, 100));
    if (
      moreErr &&
      /content_kind|column .* does not exist/i.test(moreErr.message)
    ) {
      const lean = await supabase
        .from("tracks")
        .select("id, genre, language")
        .in("id", likeTrackIds.slice(0, 100));
      more = lean.data as typeof more;
      moreErr = lean.error;
    }
    if (!moreErr) {
      for (const t of more ?? []) {
        trackMeta.set(t.id as string, {
          genre: (t.genre as string | null) ?? null,
          language: (t.language as string | null) ?? null,
          content_kind:
            (t as { content_kind?: string | null }).content_kind ?? null,
        });
      }
    }
  }

  for (const l of likeRows) {
    const meta = trackMeta.get(l.track_id as string);
    if (!meta || meta.content_kind === "podcast") continue;
    if (meta.genre?.trim()) {
      const g = meta.genre.trim();
      genreW.set(g, (genreW.get(g) ?? 0) + 3);
    }
    if (meta.language?.trim()) {
      const lang = meta.language.trim();
      langW.set(lang, (langW.get(lang) ?? 0) + 3);
    }
  }

  const toItems = (m: Map<string, number>): AffinityItem[] =>
    [...m.entries()]
      .map(([name, score]) => ({ name, score: Math.round(score * 100) / 100 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

  return {
    ok: true,
    window_days: days,
    play_count: playRows.length,
    like_count: likeRows.length,
    genres: toItems(genreW),
    languages: toItems(langW),
    countries: [],
    listening_times: toItems(timeW),
    artists: [],
    missingRpc: true,
  };
}

function mergePreferred(
  declared: string[],
  learned: AffinityItem[],
  limit: number,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  for (const d of declared) {
    const k = key(d);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(d.trim());
  }
  for (const item of learned) {
    if (out.length >= limit) break;
    const k = key(item.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item.name);
  }
  return out;
}

/** Merge onboarding taste with behavior affinity. Declared prefs stay first. */
export function mergeTasteWithBehavior(
  declared: ListenerTaste,
  affinity: BehaviorAffinity | null,
): ListenerTasteResolved {
  const hasDeclared =
    declared.countries.length > 0 ||
    declared.genres.length > 0 ||
    declared.languages.length > 0 ||
    declared.listening_times.length > 0;

  const hasBehavior =
    Boolean(affinity) &&
    ((affinity!.play_count > 0 || affinity!.like_count > 0) &&
      (affinity!.genres.length > 0 ||
        affinity!.languages.length > 0 ||
        affinity!.countries.length > 0 ||
        affinity!.listening_times.length > 0));

  if (!hasBehavior || !affinity) {
    return {
      ...declared,
      source: "declared",
      behaviorPlayCount: affinity?.play_count ?? 0,
      behaviorLikeCount: affinity?.like_count ?? 0,
    };
  }

  const genres = mergePreferred(declared.genres, affinity.genres, 10);
  const languages = mergePreferred(declared.languages, affinity.languages, 8);
  const countries = mergePreferred(declared.countries, affinity.countries, 8);
  const listening_times = mergePreferred(
    declared.listening_times,
    affinity.listening_times.map((t) => ({
      name: t.name.toLowerCase(),
      score: t.score,
    })),
    4,
  ).map((t) => t.toLowerCase());

  return {
    countries,
    genres,
    languages,
    listening_times: normalizeTasteList(listening_times),
    source: hasDeclared ? "merged" : "behavior",
    behaviorPlayCount: affinity.play_count,
    behaviorLikeCount: affinity.like_count,
  };
}

/**
 * Declared onboarding taste + play/like-derived affinity for ranking.
 * Use this on Home / Wave / hubs instead of tasteFromProfile alone.
 */
export async function loadListenerTasteWithBehavior(
  supabase: SupabaseClient,
  userId: string,
  meta?: Record<string, unknown> | null,
  days = 90,
): Promise<ListenerTasteResolved> {
  const [declared, affinity] = await Promise.all([
    loadListenerTaste(supabase, userId, meta),
    loadBehaviorAffinity(supabase, days),
  ]);
  return mergeTasteWithBehavior(declared, affinity);
}
