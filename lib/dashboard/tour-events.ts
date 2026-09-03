import type { SupabaseClient } from "@supabase/supabase-js";

export type TourEvent = {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  city: string;
  venue: string | null;
  starts_at: string;
  ends_at: string | null;
  ticket_price_xof: number | null;
  capacity: number | null;
  tickets_sold: number;
  fekk_event_id: string | null;
  fekk_checkout_url: string | null;
  cover_url: string | null;
  active: boolean;
  created_at: string | null;
};

export type TourEventWrite = {
  title: string;
  description?: string | null;
  city: string;
  venue?: string | null;
  starts_at: string;
  ends_at?: string | null;
  ticket_price_xof?: number | null;
  capacity?: number | null;
  fekk_event_id?: string | null;
  fekk_checkout_url?: string | null;
  cover_url?: string | null;
  active?: boolean;
};

function isMissing(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|schema cache/i.test(
    message,
  );
}

const SELECT =
  "id, artist_id, title, description, city, venue, starts_at, ends_at, ticket_price_xof, capacity, tickets_sold, fekk_event_id, fekk_checkout_url, cover_url, active, created_at";

function rowToEvent(row: Record<string, unknown>): TourEvent {
  return {
    id: String(row.id),
    artist_id: String(row.artist_id),
    title: String(row.title ?? ""),
    description: typeof row.description === "string" ? row.description : null,
    city: String(row.city ?? ""),
    venue: typeof row.venue === "string" ? row.venue : null,
    starts_at: String(row.starts_at ?? ""),
    ends_at: typeof row.ends_at === "string" ? row.ends_at : null,
    ticket_price_xof:
      row.ticket_price_xof == null ? null : Number(row.ticket_price_xof),
    capacity: row.capacity == null ? null : Number(row.capacity),
    tickets_sold: Number(row.tickets_sold) || 0,
    fekk_event_id:
      typeof row.fekk_event_id === "string" ? row.fekk_event_id : null,
    fekk_checkout_url:
      typeof row.fekk_checkout_url === "string" ? row.fekk_checkout_url : null,
    cover_url: typeof row.cover_url === "string" ? row.cover_url : null,
    active: row.active !== false,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
  };
}

export async function loadTourEvents(
  supabase: SupabaseClient,
  artistId: string,
  options?: { includeInactive?: boolean; upcomingOnly?: boolean },
): Promise<{ events: TourEvent[]; ready: boolean; error: string | null }> {
  let q = supabase
    .from("artist_tour_events")
    .select(SELECT)
    .eq("artist_id", artistId)
    .order("starts_at", { ascending: true });

  if (!options?.includeInactive) {
    q = q.eq("active", true);
  }
  if (options?.upcomingOnly) {
    q = q.gte("starts_at", new Date(Date.now() - 6 * 3600_000).toISOString());
  }

  const { data, error } = await q;
  if (error) {
    if (isMissing(error.message)) {
      return { events: [], ready: false, error: null };
    }
    return { events: [], ready: false, error: error.message };
  }

  return {
    events: (data ?? []).map((r) => rowToEvent(r as Record<string, unknown>)),
    ready: true,
    error: null,
  };
}

export async function createTourEvent(
  supabase: SupabaseClient,
  artistId: string,
  input: TourEventWrite,
): Promise<
  | { ok: true; event: TourEvent }
  | { ok: false; error: string; missingTable?: boolean }
> {
  const title = input.title.trim();
  const city = input.city.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (!city) return { ok: false, error: "City is required." };
  if (!input.starts_at) return { ok: false, error: "Start date is required." };

  const { data, error } = await supabase
    .from("artist_tour_events")
    .insert({
      artist_id: artistId,
      title,
      description: input.description?.trim() || null,
      city,
      venue: input.venue?.trim() || null,
      starts_at: input.starts_at,
      ends_at: input.ends_at || null,
      ticket_price_xof:
        input.ticket_price_xof == null
          ? null
          : Math.max(0, Math.round(input.ticket_price_xof)),
      capacity:
        input.capacity == null ? null : Math.max(0, Math.round(input.capacity)),
      fekk_event_id: input.fekk_event_id?.trim() || null,
      fekk_checkout_url: input.fekk_checkout_url?.trim() || null,
      cover_url: input.cover_url?.trim() || null,
      active: input.active !== false,
      updated_at: new Date().toISOString(),
    })
    .select(SELECT)
    .maybeSingle();

  if (error) {
    if (isMissing(error.message)) {
      return {
        ok: false,
        error: "Run 20260830_tour_demand_fekk.sql in Supabase.",
        missingTable: true,
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Could not create event." };
  return { ok: true, event: rowToEvent(data as Record<string, unknown>) };
}

export async function updateTourEvent(
  supabase: SupabaseClient,
  artistId: string,
  eventId: string,
  input: Partial<TourEventWrite>,
): Promise<
  | { ok: true; event: TourEvent }
  | { ok: false; error: string; missingTable?: boolean }
> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) return { ok: false, error: "Title is required." };
    patch.title = t;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.city !== undefined) {
    const c = input.city.trim();
    if (!c) return { ok: false, error: "City is required." };
    patch.city = c;
  }
  if (input.venue !== undefined) patch.venue = input.venue?.trim() || null;
  if (input.starts_at !== undefined) patch.starts_at = input.starts_at;
  if (input.ends_at !== undefined) patch.ends_at = input.ends_at || null;
  if (input.ticket_price_xof !== undefined) {
    patch.ticket_price_xof =
      input.ticket_price_xof == null
        ? null
        : Math.max(0, Math.round(input.ticket_price_xof));
  }
  if (input.capacity !== undefined) {
    patch.capacity =
      input.capacity == null ? null : Math.max(0, Math.round(input.capacity));
  }
  if (input.fekk_event_id !== undefined) {
    patch.fekk_event_id = input.fekk_event_id?.trim() || null;
  }
  if (input.fekk_checkout_url !== undefined) {
    patch.fekk_checkout_url = input.fekk_checkout_url?.trim() || null;
  }
  if (input.cover_url !== undefined) {
    patch.cover_url = input.cover_url?.trim() || null;
  }
  if (input.active !== undefined) patch.active = input.active;

  const { data, error } = await supabase
    .from("artist_tour_events")
    .update(patch)
    .eq("id", eventId)
    .eq("artist_id", artistId)
    .select(SELECT)
    .maybeSingle();

  if (error) {
    if (isMissing(error.message)) {
      return {
        ok: false,
        error: "Run 20260830_tour_demand_fekk.sql in Supabase.",
        missingTable: true,
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Event not found." };
  return { ok: true, event: rowToEvent(data as Record<string, unknown>) };
}

export async function deleteTourEvent(
  supabase: SupabaseClient,
  artistId: string,
  eventId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("artist_tour_events")
    .delete()
    .eq("id", eventId)
    .eq("artist_id", artistId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function purchaseTourTicket(
  supabase: SupabaseClient,
  eventId: string,
  quantity: number,
  phone?: string | null,
): Promise<
  | {
      ok: true;
      purchaseId: number;
      title: string;
      city: string;
      priceXof: number;
      quantity: number;
      fekkEventId: string | null;
      fekkCheckoutUrl: string | null;
    }
  | { ok: false; error: string; code?: string }
> {
  const idNum = Number(eventId);
  if (!Number.isFinite(idNum)) {
    return { ok: false, error: "Invalid event.", code: "event_not_found" };
  }

  const { data, error } = await supabase.rpc("purchase_tour_ticket", {
    p_event_id: idNum,
    p_quantity: quantity,
    p_payment_phone: phone?.trim() || null,
  });

  if (error) {
    if (/not_authenticated/i.test(error.message)) {
      return { ok: false, error: "Sign in required.", code: "auth" };
    }
    if (/event_not_found/i.test(error.message)) {
      return { ok: false, error: "Show not found.", code: "event_not_found" };
    }
    if (/sold_out/i.test(error.message)) {
      return { ok: false, error: "Sold out.", code: "sold_out" };
    }
    if (/own_event/i.test(error.message)) {
      return { ok: false, error: "You can’t buy tickets to your own show." };
    }
    if (/event_passed/i.test(error.message)) {
      return { ok: false, error: "This show has already passed." };
    }
    if (/tickets_not_for_sale/i.test(error.message)) {
      return { ok: false, error: "Tickets are not on sale for this show." };
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
  return {
    ok: true,
    purchaseId: Number(row?.purchase_id),
    title: String(row?.title ?? ""),
    city: String(row?.city ?? ""),
    priceXof: Number(row?.price_xof) || 0,
    quantity: Number(row?.quantity) || 1,
    fekkEventId:
      typeof row?.fekk_event_id === "string" ? row.fekk_event_id : null,
    fekkCheckoutUrl:
      typeof row?.fekk_checkout_url === "string" ? row.fekk_checkout_url : null,
  };
}

export async function setTourTicketFekkReference(
  supabase: SupabaseClient,
  purchaseId: number,
  reference: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("set_tour_ticket_fekk_reference", {
    p_purchase_id: purchaseId,
    p_reference: reference,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
