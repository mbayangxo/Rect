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
      ok: true;
      packs: [];
      empty: true;
      error: null;
      missingTable: true;
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
 * If table missing or no rows: empty (UI shows nothing).
 */
export async function loadPlayPacks(
  _supabase: SupabaseClient,
  country = "SN",
): Promise<PlayPacksLoadResult> {
  try {
    const admin = createAdminClient();
    const db = admin ?? _supabase;

    const { data, error } = await db
      .from("play_packs")
      .select(
        "id, country, code, name, description, price_label, play_credits, sort_order",
      )
      .eq("country", country)
      .order("sort_order", { ascending: true });

    if (error) {
      const missing =
        /relation .* does not exist|Could not find the table|PGRST205/i.test(
          error.message,
        );
      if (missing) {
        return {
          ok: true,
          packs: [],
          empty: true,
          error: null,
          missingTable: true,
        };
      }
      return {
        ok: false,
        packs: [],
        empty: true,
        error: error.message,
        missingTable: false,
      };
    }

    const packs = (data ?? []) as PlayPack[];
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
