import type { SupabaseClient } from "@supabase/supabase-js";

export type CityRequest = {
  id: number;
  artistId: string;
  fanId: string;
  city: string;
  place: string | null;
  note: string | null;
  createdAt: string | null;
};

export type CityDemandRow = {
  city: string;
  place: string | null;
  requestCount: number;
  uniqueFans: number;
};

function isMissing(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|schema cache/i.test(
    message,
  );
}

export async function requestArtistCity(
  supabase: SupabaseClient,
  artistId: string,
  city: string,
  place?: string | null,
  note?: string | null,
): Promise<{ ok: true; requestId: number } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("request_artist_city", {
    p_artist_id: artistId,
    p_city: city.trim(),
    p_place: place?.trim() || null,
    p_note: note?.trim() || null,
  });

  if (error) {
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required." };
    }
    if (/invalid_artist/i.test(error.message)) {
      return { ok: false, error: "You can’t request yourself." };
    }
    if (/city_required/i.test(error.message)) {
      return { ok: false, error: "Enter a city." };
    }
    if (isMissing(error.message)) {
      return {
        ok: false,
        error: "Run 20260830_tour_demand_fekk.sql in Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }

  const row = data as Record<string, unknown> | null;
  return { ok: true, requestId: Number(row?.request_id) || 0 };
}

export async function loadCityDemandForArtist(
  supabase: SupabaseClient,
  artistId: string,
): Promise<{ rows: CityDemandRow[]; ready: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc("artist_city_demand", {
    p_artist_id: artistId,
  });

  if (error) {
    if (isMissing(error.message) || /artist_city_demand|function/i.test(error.message)) {
      // Fallback: direct select (works for artist own rows via RLS)
      const direct = await supabase
        .from("artist_city_requests")
        .select("city, place, fan_id")
        .eq("artist_id", artistId);

      if (direct.error) {
        if (isMissing(direct.error.message)) {
          return { rows: [], ready: false, error: null };
        }
        return { rows: [], ready: false, error: direct.error.message };
      }

      return { rows: aggregateDemand(direct.data ?? []), ready: true, error: null };
    }
    return { rows: [], ready: false, error: error.message };
  }

  const payload = data as { rows?: unknown } | null;
  const raw = Array.isArray(payload?.rows) ? payload.rows : [];
  const rows: CityDemandRow[] = raw
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        city: String(row.city ?? "").trim(),
        place: typeof row.place === "string" ? row.place : null,
        requestCount: Number(row.request_count) || 0,
        uniqueFans: Number(row.unique_fans) || 0,
      };
    })
    .filter((r) => r.city)
    .sort((a, b) => b.requestCount - a.requestCount);

  return { rows, ready: true, error: null };
}

function aggregateDemand(
  data: { city?: unknown; place?: unknown; fan_id?: unknown }[],
): CityDemandRow[] {
  const byCity = new Map<
    string,
    { city: string; place: string | null; fans: Set<string>; count: number }
  >();

  for (const row of data) {
    const city = String(row.city ?? "").trim();
    if (!city) continue;
    const key = city.toLowerCase();
    const cur = byCity.get(key) ?? {
      city,
      place: typeof row.place === "string" ? row.place : null,
      fans: new Set<string>(),
      count: 0,
    };
    cur.count += 1;
    if (row.fan_id) cur.fans.add(String(row.fan_id));
    if (!cur.place && typeof row.place === "string") cur.place = row.place;
    byCity.set(key, cur);
  }

  return [...byCity.values()]
    .map((v) => ({
      city: v.city,
      place: v.place,
      requestCount: v.count,
      uniqueFans: v.fans.size,
    }))
    .sort((a, b) => b.requestCount - a.requestCount);
}

export async function fanHasRequestedCity(
  supabase: SupabaseClient,
  artistId: string,
  fanId: string,
): Promise<{ cities: string[]; ready: boolean }> {
  const { data, error } = await supabase
    .from("artist_city_requests")
    .select("city")
    .eq("artist_id", artistId)
    .eq("fan_id", fanId);

  if (error) {
    return { cities: [], ready: !isMissing(error.message) };
  }

  return {
    cities: (data ?? [])
      .map((r) => String(r.city ?? "").trim())
      .filter(Boolean),
    ready: true,
  };
}
