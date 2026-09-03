import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrackRow } from "@/lib/tracks";

function isMissing(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type ListeningParty = {
  id: string;
  host_id: string;
  title: string;
  track_id: string | null;
  status: "scheduled" | "live" | "ended";
  invite_code: string;
  cover_url: string | null;
  starts_at: string | null;
  ended_at: string | null;
  created_at: string;
  host_name?: string | null;
  member_count?: number;
  track?: TrackRow | null;
};

export type PartyMessage = {
  id: number;
  party_id: string;
  sender_id: string;
  body: string;
  kind: "text" | "gif" | "photo";
  media_url: string | null;
  created_at: string;
  sender_name?: string;
};

function mapParty(row: Record<string, unknown>): ListeningParty {
  return {
    id: String(row.id),
    host_id: String(row.host_id),
    title: String(row.title ?? "Listening party"),
    track_id: typeof row.track_id === "string" ? row.track_id : null,
    status: (row.status as ListeningParty["status"]) || "live",
    invite_code: String(row.invite_code ?? ""),
    cover_url: typeof row.cover_url === "string" ? row.cover_url : null,
    starts_at: typeof row.starts_at === "string" ? row.starts_at : null,
    ended_at: typeof row.ended_at === "string" ? row.ended_at : null,
    created_at: String(row.created_at ?? ""),
  };
}

export async function createListeningParty(
  supabase: SupabaseClient,
  title: string,
  trackId?: string | null,
): Promise<
  | { ok: true; party_id: string }
  | { ok: false; error: string; missingTable?: boolean }
> {
  const { data, error } = await supabase.rpc("create_listening_party", {
    p_title: title.trim(),
    p_track_id: trackId ?? null,
  });
  if (error) {
    if (isMissing(error.message)) {
      return {
        ok: false,
        error: "Run 20260903_listening_parties.sql in Supabase.",
        missingTable: true,
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, party_id: String(data) };
}

export async function loadPartyById(
  supabase: SupabaseClient,
  partyId: string,
): Promise<{
  party: ListeningParty | null;
  missingTable: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("listening_parties")
    .select(
      "id, host_id, title, track_id, status, invite_code, cover_url, starts_at, ended_at, created_at",
    )
    .eq("id", partyId)
    .maybeSingle();

  if (error) {
    if (isMissing(error.message)) {
      return { party: null, missingTable: true, error: null };
    }
    return { party: null, missingTable: false, error: error.message };
  }
  if (!data) return { party: null, missingTable: false, error: null };
  return { party: mapParty(data as Record<string, unknown>), missingTable: false, error: null };
}

export async function loadPartyByCode(
  supabase: SupabaseClient,
  code: string,
): Promise<{
  party: ListeningParty | null;
  missingTable: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("listening_parties")
    .select(
      "id, host_id, title, track_id, status, invite_code, cover_url, starts_at, ended_at, created_at",
    )
    .eq("invite_code", code.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    if (isMissing(error.message)) {
      return { party: null, missingTable: true, error: null };
    }
    return { party: null, missingTable: false, error: error.message };
  }
  if (!data) return { party: null, missingTable: false, error: null };
  return { party: mapParty(data as Record<string, unknown>), missingTable: false, error: null };
}

export async function joinParty(
  supabase: SupabaseClient,
  partyId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string; missingTable?: boolean }> {
  const { error } = await supabase.from("listening_party_members").upsert(
    { party_id: partyId, user_id: userId },
    { onConflict: "party_id,user_id" },
  );
  if (error) {
    if (isMissing(error.message)) {
      return {
        ok: false,
        error: "Run 20260903_listening_parties.sql in Supabase.",
        missingTable: true,
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function endParty(
  supabase: SupabaseClient,
  partyId: string,
  hostId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("listening_parties")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", partyId)
    .eq("host_id", hostId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function loadPartyMessages(
  supabase: SupabaseClient,
  partyId: string,
  limit = 80,
): Promise<{ messages: PartyMessage[]; error: string | null }> {
  const { data, error } = await supabase
    .from("listening_party_messages")
    .select("id, party_id, sender_id, body, kind, media_url, created_at")
    .eq("party_id", partyId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissing(error.message)) return { messages: [], error: null };
    return { messages: [], error: error.message };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const senderIds = [...new Set(rows.map((r) => String(r.sender_id)))];
  const nameById = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, display_name")
      .in("id", senderIds);
    for (const u of users ?? []) {
      nameById.set(
        String(u.id),
        (typeof u.display_name === "string" && u.display_name.trim()) || "Fan",
      );
    }
  }

  return {
    messages: rows.map((r) => ({
      id: Number(r.id),
      party_id: String(r.party_id),
      sender_id: String(r.sender_id),
      body: String(r.body ?? ""),
      kind: (r.kind as PartyMessage["kind"]) || "text",
      media_url: typeof r.media_url === "string" ? r.media_url : null,
      created_at: String(r.created_at ?? ""),
      sender_name: nameById.get(String(r.sender_id)),
    })),
    error: null,
  };
}

export async function postPartyMessage(
  supabase: SupabaseClient,
  partyId: string,
  senderId: string,
  body: string,
  kind: "text" | "gif" | "photo" = "text",
  mediaUrl?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = body.trim();
  if (!text && !mediaUrl) {
    return { ok: false, error: "Message required." };
  }
  const { error } = await supabase.from("listening_party_messages").insert({
    party_id: partyId,
    sender_id: senderId,
    body: text || (kind === "gif" ? "GIF" : "Photo"),
    kind,
    media_url: mediaUrl ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function loadLiveParties(
  supabase: SupabaseClient,
  limit = 20,
): Promise<{ parties: ListeningParty[]; missingTable: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from("listening_parties")
    .select(
      "id, host_id, title, track_id, status, invite_code, cover_url, starts_at, ended_at, created_at",
    )
    .eq("status", "live")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissing(error.message)) {
      return { parties: [], missingTable: true, error: null };
    }
    return { parties: [], missingTable: false, error: error.message };
  }

  return {
    parties: ((data ?? []) as Record<string, unknown>[]).map(mapParty),
    missingTable: false,
    error: null,
  };
}
