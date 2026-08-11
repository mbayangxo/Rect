import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type PlayPack = {
  id: string;
  country: string;
  code: string;
  name: string;
  description: string | null;
  price_label: string | null;
  play_credits: number | null;
  sort_order: number | null;
};

export type PlayPacksLoadResult =
  | {
      ok: true;
      packs: PlayPack[];
      empty: boolean;
      error: null;
      missingTable: false;
    }
  | {
      ok: false;
      packs: [];
      empty: true;
      error: string;
      missingTable: boolean;
    };

/**
 * CONNECTION 5 — play packs for a country (default SN).
 * Missing table / query failure → ok:false (surface error; do not hide UI).
 * Falls back to SN when the preferred country has no packs seeded.
 */
export async function loadPlayPacks(
  _supabase: SupabaseClient,
  country = "SN",
): Promise<PlayPacksLoadResult> {
  const primary = await loadPlayPacksForCountry(_supabase, country);
  if (!primary.ok) return primary;
  if (primary.packs.length > 0 || country === "SN") return primary;
  return loadPlayPacksForCountry(_supabase, "SN");
}

async function loadPlayPacksForCountry(
  _supabase: SupabaseClient,
  country: string,
): Promise<PlayPacksLoadResult> {
  try {
    const admin = createAdminClient();
    const db = admin ?? _supabase;

    const { data, error } = await db
      .from("play_packs")
      .select(
        "id, country, code, name, description, price_label, play_credits, sort_order, active",
      )
      .eq("country", country)
      .order("sort_order", { ascending: true });

    if (error) {
      const missing =
        /relation .* does not exist|Could not find the table|PGRST205/i.test(
          error.message,
        ) || /column .* does not exist/i.test(error.message);
      return {
        ok: false,
        packs: [],
        empty: true,
        error: missing
          ? "Run play_packs migration in Supabase SQL Editor."
          : error.message,
        missingTable: missing,
      };
    }

    const packs: PlayPack[] = (data ?? [])
      .filter((row) => row.active !== false)
      .map((row) => ({
      id: String(row.id),
      country: String(row.country ?? ""),
      code: String(row.code ?? ""),
      name: String(row.name ?? ""),
      description:
        typeof row.description === "string" ? row.description : null,
      price_label:
        typeof row.price_label === "string" ? row.price_label : null,
      play_credits:
        row.play_credits == null ? null : Number(row.play_credits),
      sort_order: row.sort_order == null ? null : Number(row.sort_order),
    }));
    return {
      ok: true,
      packs,
      empty: packs.length === 0,
      error: null,
      missingTable: false,
    };
  } catch (e) {
    return {
      ok: false,
      packs: [],
      empty: true,
      error: e instanceof Error ? e.message : "Failed to load play packs",
      missingTable: false,
    };
  }
}
