import type { SupabaseClient } from "@supabase/supabase-js";

export type FanClubTier = {
  id: number;
  artistId: string;
  name: string;
  description: string | null;
  priceXofMonth: number;
  perks: string[];
  sortOrder: number;
  active: boolean;
};

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205/i.test(
    message,
  );
}

function parsePerks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === "string");
}

export async function loadFanClubTiers(
  supabase: SupabaseClient,
  artistId: string,
  options?: { includeInactive?: boolean },
): Promise<{ tiers: FanClubTier[]; ready: boolean; error: string | null }> {
  try {
    let q = supabase
      .from("fan_club_tiers")
      .select(
        "id, artist_id, name, description, price_xof_month, perks, sort_order, active",
      )
      .eq("artist_id", artistId)
      .order("sort_order", { ascending: true });

    if (!options?.includeInactive) {
      q = q.eq("active", true);
    }

    const { data, error } = await q;
    if (error) {
      if (isMissingRelation(error.message)) {
        return { tiers: [], ready: false, error: null };
      }
      return { tiers: [], ready: false, error: error.message };
    }

    const tiers: FanClubTier[] = (data ?? []).map((r) => ({
      id: Number(r.id),
      artistId: String(r.artist_id),
      name: String(r.name),
      description:
        typeof r.description === "string" ? r.description : null,
      priceXofMonth: Number(r.price_xof_month) || 0,
      perks: parsePerks(r.perks),
      sortOrder: Number(r.sort_order) || 0,
      active: Boolean(r.active),
    }));

    return { tiers, ready: true, error: null };
  } catch (e) {
    return {
      tiers: [],
      ready: false,
      error: e instanceof Error ? e.message : "Failed to load fan club",
    };
  }
}

export async function countFanClubMembers(
  supabase: SupabaseClient,
  artistId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("fan_club_members")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId)
    .eq("status", "active");

  if (error && isMissingRelation(error.message)) return 0;
  return count ?? 0;
}

export async function upsertFanClubTier(
  supabase: SupabaseClient,
  artistId: string,
  input: {
    id?: number;
    name: string;
    description?: string;
    priceXofMonth: number;
    perks?: string[];
    sortOrder?: number;
    active?: boolean;
  },
): Promise<{ ok: true; tier: FanClubTier } | { ok: false; error: string }> {
  const row = {
    artist_id: artistId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    price_xof_month: Math.max(0, Math.round(input.priceXofMonth)),
    perks: input.perks ?? [],
    sort_order: input.sortOrder ?? 0,
    active: input.active ?? true,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("fan_club_tiers")
      .update(row)
      .eq("id", input.id)
      .eq("artist_id", artistId)
      .select(
        "id, artist_id, name, description, price_xof_month, perks, sort_order, active",
      )
      .maybeSingle();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Update failed" };
    }
    return {
      ok: true,
      tier: {
        id: Number(data.id),
        artistId: String(data.artist_id),
        name: String(data.name),
        description:
          typeof data.description === "string" ? data.description : null,
        priceXofMonth: Number(data.price_xof_month) || 0,
        perks: parsePerks(data.perks),
        sortOrder: Number(data.sort_order) || 0,
        active: Boolean(data.active),
      },
    };
  }

  const { data, error } = await supabase
    .from("fan_club_tiers")
    .insert(row)
    .select(
      "id, artist_id, name, description, price_xof_month, perks, sort_order, active",
    )
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Create failed" };
  }

  return {
    ok: true,
    tier: {
      id: Number(data.id),
      artistId: String(data.artist_id),
      name: String(data.name),
      description:
        typeof data.description === "string" ? data.description : null,
      priceXofMonth: Number(data.price_xof_month) || 0,
      perks: parsePerks(data.perks),
      sortOrder: Number(data.sort_order) || 0,
      active: Boolean(data.active),
    },
  };
}

export async function subscribeFanClubTier(
  supabase: SupabaseClient,
  tierId: number,
  paymentMethod: string,
  phone: string,
): Promise<
  | {
      ok: true;
      memberId: number;
      priceXof: number;
      tierName: string;
      artistId: string;
      status: string;
      skipped?: string;
    }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc("subscribe_fan_club_tier", {
    p_tier_id: tierId,
    p_payment_method: paymentMethod,
    p_payment_phone: phone.trim(),
  });

  if (error) {
    if (/own_tier/i.test(error.message)) {
      return { ok: false, error: "You cannot join your own fan club." };
    }
    if (/tier_not_found/i.test(error.message)) {
      return { ok: false, error: "Tier not found." };
    }
    return { ok: false, error: error.message };
  }

  const row = data as Record<string, unknown> | null;
  return {
    ok: true,
    memberId: Number(row?.member_id),
    priceXof: Number(row?.price_xof) || 0,
    tierName: String(row?.tier_name ?? "Fan club"),
    artistId: String(row?.artist_id ?? ""),
    status: String(row?.status ?? "pending"),
    skipped: typeof row?.skipped === "string" ? row.skipped : undefined,
  };
}

export async function setFanClubJokoReference(
  supabase: SupabaseClient,
  memberId: number,
  reference: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("set_fan_club_joko_reference", {
    p_member_id: memberId,
    p_reference: reference,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function loadFanClubGrowth(
  supabase: SupabaseClient,
  artistId: string,
): Promise<{ date: string; count: number }[]> {
  const { data, error } = await supabase
    .from("fan_club_members")
    .select("started_at")
    .eq("artist_id", artistId)
    .eq("status", "active")
    .order("started_at", { ascending: true });

  if (error || !data?.length) return [];

  const byDay = new Map<string, number>();
  for (const row of data) {
    const at = row.started_at as string | null;
    if (!at) continue;
    const day = at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}
