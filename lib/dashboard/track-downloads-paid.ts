import type { SupabaseClient } from "@supabase/supabase-js";

export async function purchaseTrackDownload(
  supabase: SupabaseClient,
  trackId: string,
  paymentMethod: string,
  phone: string,
): Promise<
  | {
      ok: true;
      purchaseId: number;
      priceXof: number;
      artistId: string;
    }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc("purchase_track_download", {
    p_track_id: trackId,
    p_payment_method: paymentMethod,
    p_payment_phone: phone.trim(),
  });

  if (error) {
    if (/download_not_for_sale/i.test(error.message)) {
      return { ok: false, error: "This track is not for sale." };
    }
    if (/already_purchased/i.test(error.message)) {
      return { ok: false, error: "You already own this download." };
    }
    if (/own_track/i.test(error.message)) {
      return { ok: false, error: "Artists get free access to their own tracks." };
    }
    return { ok: false, error: error.message };
  }

  const row = data as Record<string, unknown> | null;
  return {
    ok: true,
    purchaseId: Number(row?.purchase_id),
    priceXof: Number(row?.price_xof) || 0,
    artistId: String(row?.artist_id ?? ""),
  };
}

export async function setTrackDownloadJokoReference(
  supabase: SupabaseClient,
  purchaseId: number,
  reference: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("set_track_download_joko_reference", {
    p_purchase_id: purchaseId,
    p_reference: reference,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function userOwnsTrackDownload(
  supabase: SupabaseClient,
  userId: string,
  trackId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("track_download_purchases")
    .select("id")
    .eq("track_id", trackId)
    .eq("buyer_id", userId)
    .eq("status", "confirmed")
    .maybeSingle();

  return Boolean(data);
}

export async function countTrackDownloadSales(
  supabase: SupabaseClient,
  artistId: string,
  trackIds?: string[],
): Promise<Map<string, number>> {
  let q = supabase
    .from("track_download_purchases")
    .select("track_id")
    .eq("artist_id", artistId)
    .eq("status", "confirmed");

  if (trackIds?.length) {
    q = q.in("track_id", trackIds);
  }

  const { data, error } = await q;
  const map = new Map<string, number>();
  if (error) return map;

  for (const row of data ?? []) {
    const tid = String(row.track_id);
    map.set(tid, (map.get(tid) ?? 0) + 1);
  }
  return map;
}
