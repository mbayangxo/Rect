import type { SupabaseClient } from "@supabase/supabase-js";

export type MerchCategory = "clothing" | "digital" | "physical";

export type MerchMusicFormat = "album" | "cd" | "vinyl";

export type ArtistMerchItem = {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  price_xof: number;
  image_urls: string[];
  category: MerchCategory;
  music_format: MerchMusicFormat | null;
  track_id: string | null;
  quantity_available: number | null;
  sales_count: number;
  active: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
};

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|schema cache/i.test(
    message,
  );
}

function parseImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
}

function parseMusicFormat(value: unknown): MerchMusicFormat | null {
  if (value === "album" || value === "cd" || value === "vinyl") return value;
  return null;
}

function rowToItem(row: Record<string, unknown>): ArtistMerchItem {
  return {
    id: String(row.id),
    artist_id: String(row.artist_id),
    title: String(row.title ?? ""),
    description:
      typeof row.description === "string" ? row.description : null,
    price_xof: Number(row.price_xof) || 0,
    image_urls: parseImageUrls(row.image_urls),
    category: (row.category as MerchCategory) || "physical",
    music_format: parseMusicFormat(row.music_format),
    track_id:
      typeof row.track_id === "string" && row.track_id.trim()
        ? row.track_id.trim()
        : null,
    quantity_available:
      row.quantity_available == null ? null : Number(row.quantity_available),
    sales_count: Number(row.sales_count) || 0,
    active: row.active !== false,
    sort_order: Number(row.sort_order) || 0,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

const MERCH_SELECT =
  "id, artist_id, title, description, price_xof, image_urls, category, music_format, track_id, quantity_available, sales_count, active, sort_order, created_at, updated_at";

const MERCH_SELECT_LEAN =
  "id, artist_id, title, description, price_xof, image_urls, category, quantity_available, sales_count, active, sort_order, created_at, updated_at";

function isMissingMusicColumns(message: string) {
  return /music_format|track_id|column .* does not exist/i.test(message);
}

export async function loadArtistMerchItems(
  supabase: SupabaseClient,
  artistId: string,
  options?: { publicOnly?: boolean; includeInactive?: boolean },
): Promise<{
  items: ArtistMerchItem[];
  missingTable: boolean;
  error: string | null;
}> {
  try {
    let query = supabase
      .from("artist_merch_items")
      .select(MERCH_SELECT)
      .eq("artist_id", artistId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (options?.publicOnly) {
      query = query.eq("active", true);
    } else if (!options?.includeInactive) {
      // studio view: all items including drafts
    }

    let { data: rawData, error } = await query;
    let data = rawData as Record<string, unknown>[] | null;

    if (error && isMissingMusicColumns(error.message)) {
      let leanQuery = supabase
        .from("artist_merch_items")
        .select(MERCH_SELECT_LEAN)
        .eq("artist_id", artistId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (options?.publicOnly) {
        leanQuery = leanQuery.eq("active", true);
      }
      const lean = await leanQuery;
      data = (lean.data ?? []) as Record<string, unknown>[];
      error = lean.error;
    }

    if (error) {
      if (isMissingRelation(error.message)) {
        return { items: [], missingTable: true, error: null };
      }
      return { items: [], missingTable: false, error: error.message };
    }

    return {
      items: (data ?? []).map((r) => rowToItem(r as Record<string, unknown>)),
      missingTable: false,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load merch";
    return {
      items: [],
      missingTable: isMissingRelation(msg),
      error: msg,
    };
  }
}

export type MerchWriteInput = {
  title: string;
  description?: string | null;
  price_xof: number;
  category: MerchCategory;
  music_format?: MerchMusicFormat | null;
  track_id?: string | null;
  quantity_available?: number | null;
  active?: boolean;
  image_urls?: string[];
};

export async function createMerchItem(
  supabase: SupabaseClient,
  artistId: string,
  input: MerchWriteInput,
): Promise<
  | { ok: true; item: ArtistMerchItem }
  | { ok: false; error: string; missingTable?: boolean }
> {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "Title is required." };
  }

  const insertPayload: Record<string, unknown> = {
    artist_id: artistId,
    title,
    description: input.description?.trim() || null,
    price_xof: Math.max(0, Math.round(input.price_xof)),
    category: input.category,
    quantity_available: input.quantity_available ?? null,
    active: input.active !== false,
    image_urls: input.image_urls ?? [],
    updated_at: new Date().toISOString(),
  };
  if (input.music_format) {
    insertPayload.music_format = input.music_format;
    insertPayload.track_id = input.track_id?.trim() || null;
  } else if (input.music_format === null) {
    insertPayload.music_format = null;
    insertPayload.track_id = null;
  }

  const insertRes = await supabase
    .from("artist_merch_items")
    .insert(insertPayload)
    .select(MERCH_SELECT)
    .maybeSingle();

  let error = insertRes.error;
  let data: Record<string, unknown> | null =
    (insertRes.data as Record<string, unknown> | null) ?? null;

  if (error && isMissingMusicColumns(error.message)) {
    delete insertPayload.music_format;
    delete insertPayload.track_id;
    const retry = await supabase
      .from("artist_merch_items")
      .insert(insertPayload)
      .select(MERCH_SELECT_LEAN)
      .maybeSingle();
    data = retry.data as Record<string, unknown> | null;
    error = retry.error;
  }

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run 20260830_artist_merch_store.sql in Supabase.",
        missingTable: true,
      };
    }
    return { ok: false, error: error.message };
  }

  if (!data) {
    return { ok: false, error: "Could not create merch item." };
  }

  return { ok: true, item: rowToItem(data as Record<string, unknown>) };
}

export async function updateMerchItem(
  supabase: SupabaseClient,
  artistId: string,
  itemId: string,
  input: Partial<MerchWriteInput>,
): Promise<
  | { ok: true; item: ArtistMerchItem }
  | { ok: false; error: string; missingTable?: boolean }
> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) return { ok: false, error: "Title is required." };
    patch.title = title;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.price_xof !== undefined) {
    patch.price_xof = Math.max(0, Math.round(input.price_xof));
  }
  if (input.category !== undefined) patch.category = input.category;
  if (input.music_format !== undefined) {
    patch.music_format = input.music_format;
    patch.track_id =
      input.music_format && input.track_id?.trim()
        ? input.track_id.trim()
        : null;
  }
  if (input.track_id !== undefined && input.music_format === undefined) {
    patch.track_id = input.track_id?.trim() || null;
  }
  if (input.quantity_available !== undefined) {
    patch.quantity_available = input.quantity_available;
  }
  if (input.active !== undefined) patch.active = input.active;
  if (input.image_urls !== undefined) patch.image_urls = input.image_urls;

  const updateRes = await supabase
    .from("artist_merch_items")
    .update(patch)
    .eq("id", itemId)
    .eq("artist_id", artistId)
    .select(MERCH_SELECT)
    .maybeSingle();

  let error = updateRes.error;
  let data: Record<string, unknown> | null =
    (updateRes.data as Record<string, unknown> | null) ?? null;

  if (error && isMissingMusicColumns(error.message)) {
    delete patch.music_format;
    delete patch.track_id;
    const retry = await supabase
      .from("artist_merch_items")
      .update(patch)
      .eq("id", itemId)
      .eq("artist_id", artistId)
      .select(MERCH_SELECT_LEAN)
      .maybeSingle();
    data = retry.data as Record<string, unknown> | null;
    error = retry.error;
  }

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run 20260830_artist_merch_store.sql in Supabase.",
        missingTable: true,
      };
    }
    return { ok: false, error: error.message };
  }

  if (!data) {
    return { ok: false, error: "Merch item not found." };
  }

  return { ok: true, item: rowToItem(data as Record<string, unknown>) };
}

export async function deleteMerchItem(
  supabase: SupabaseClient,
  artistId: string,
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string; missingTable?: boolean }> {
  const { error } = await supabase
    .from("artist_merch_items")
    .delete()
    .eq("id", itemId)
    .eq("artist_id", artistId);

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run 20260830_artist_merch_store.sql in Supabase.",
        missingTable: true,
      };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export function formatMerchPriceXof(price: number): string {
  return `${price.toLocaleString("fr-FR")} CFA`;
}

export async function purchaseMerchItem(
  supabase: SupabaseClient,
  merchId: string,
  paymentMethod: string,
  phone: string,
): Promise<
  | {
      ok: true;
      purchase_id: number;
      title: string;
      price_xof: number;
    }
  | { ok: false; error: string; code?: string }
> {
  const idNum = Number(merchId);
  if (!Number.isFinite(idNum)) {
    return { ok: false, error: "Invalid item", code: "merch_not_found" };
  }

  const { data, error } = await supabase.rpc("purchase_merch_item", {
    p_merch_id: idNum,
    p_payment_method: paymentMethod,
    p_payment_phone: phone,
  });

  if (error) {
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    if (/merch_not_found/i.test(error.message)) {
      return { ok: false, error: "Item not found", code: "merch_not_found" };
    }
    if (/cannot_buy_own_merch/i.test(error.message)) {
      return { ok: false, error: "You cannot buy your own merch.", code: "own_merch" };
    }
    if (/merch_sold_out/i.test(error.message)) {
      return { ok: false, error: "Sold out", code: "sold_out" };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as Record<string, unknown> | null;
  return {
    ok: true,
    purchase_id: Number(row?.purchase_id),
    title: String(row?.title ?? ""),
    price_xof: Number(row?.price_xof) || 0,
  };
}

export async function confirmMerchPurchase(
  supabase: SupabaseClient,
  purchaseId: number,
): Promise<
  | { ok: true; title: string; purchase_id: number }
  | { ok: false; error: string; code?: string }
> {
  const { data, error } = await supabase.rpc("confirm_merch_purchase", {
    p_purchase_id: purchaseId,
  });

  if (error) {
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as Record<string, unknown> | null;
  return {
    ok: true,
    purchase_id: Number(row?.purchase_id) || purchaseId,
    title: String(row?.title ?? ""),
  };
}

export async function setMerchJokoReference(
  supabase: SupabaseClient,
  purchaseId: number,
  reference: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("set_merch_joko_reference", {
    p_purchase_id: purchaseId,
    p_reference: reference,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
