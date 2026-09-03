import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type DmThread = {
  conversation_id: string;
  other_id: string;
  other_name: string;
  other_avatar: string | null;
  last_body: string | null;
  last_at: string | null;
  unread: boolean;
  updated_at: string;
};

export type DmMessage = {
  id: number;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  mine: boolean;
};

function displayName(
  row: {
    display_name?: string | null;
    email?: string | null;
  } | null,
  fallback: string,
) {
  const name = row?.display_name?.trim();
  if (name) return name;
  const email = row?.email?.trim();
  if (email) return email.split("@")[0] || fallback;
  return fallback;
}

export async function openOrGetDm(
  supabase: SupabaseClient,
  otherId: string,
): Promise<
  | { ok: true; conversation_id: string; other_id: string }
  | { ok: false; error: string; code: string }
> {
  const { data, error } = await supabase.rpc("open_or_get_dm", {
    p_other_id: otherId,
  });
  if (error) {
    const msg = error.message || "Could not open conversation";
    if (isMissingRelation(msg)) {
      return { ok: false, error: "Run direct messages SQL in Supabase.", code: "missing_table" };
    }
    if (/not_authenticated/i.test(msg)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    if (/cannot_dm_self/i.test(msg)) {
      return { ok: false, error: "You can’t message yourself", code: "cannot_dm_self" };
    }
    if (/blocked/i.test(msg)) {
      return { ok: false, error: "Messaging unavailable", code: "blocked" };
    }
    if (/user_not_found|user_required/i.test(msg)) {
      return { ok: false, error: "User not found", code: "user_not_found" };
    }
    return { ok: false, error: msg, code: "error" };
  }
  const row = data as { conversation_id?: string; other_id?: string } | null;
  if (!row?.conversation_id) {
    return { ok: false, error: "Could not open conversation", code: "error" };
  }
  return {
    ok: true,
    conversation_id: String(row.conversation_id),
    other_id: String(row.other_id ?? otherId),
  };
}

export async function sendDm(
  supabase: SupabaseClient,
  conversationId: string,
  body: string,
): Promise<
  | {
      ok: true;
      message: DmMessage;
    }
  | { ok: false; error: string; code: string }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required", code: "not_authenticated" };
  }

  const { data, error } = await supabase.rpc("send_dm", {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) {
    const msg = error.message || "Could not send";
    if (isMissingRelation(msg)) {
      return { ok: false, error: "Run direct messages SQL in Supabase.", code: "missing_table" };
    }
    if (/not_authenticated/i.test(msg)) {
      return { ok: false, error: "Sign in required", code: "not_authenticated" };
    }
    if (/blocked/i.test(msg)) {
      return { ok: false, error: "Messaging unavailable", code: "blocked" };
    }
    if (/body_required/i.test(msg)) {
      return { ok: false, error: "Write a message first", code: "body_required" };
    }
    if (/not_participant/i.test(msg)) {
      return { ok: false, error: "Not in this conversation", code: "not_participant" };
    }
    return { ok: false, error: msg, code: "error" };
  }

  const row = data as {
    message_id?: number;
    conversation_id?: string;
    sender_id?: string;
    body?: string;
    created_at?: string;
  } | null;

  if (!row?.message_id) {
    return { ok: false, error: "Could not send", code: "error" };
  }

  return {
    ok: true,
    message: {
      id: Number(row.message_id),
      conversation_id: String(row.conversation_id ?? conversationId),
      sender_id: String(row.sender_id ?? user.id),
      body: String(row.body ?? body),
      created_at: String(row.created_at ?? new Date().toISOString()),
      mine: true,
    },
  };
}

export async function markDmRead(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<{ ok: boolean; error?: string; missingTable?: boolean }> {
  const { error } = await supabase.rpc("mark_dm_read", {
    p_conversation_id: conversationId,
  });
  if (error) {
    if (isMissingRelation(error.message)) {
      return { ok: false, error: error.message, missingTable: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function loadDmThreads(
  supabase: SupabaseClient,
  viewerId: string,
): Promise<{
  threads: DmThread[];
  error: string | null;
  missingTable: boolean;
}> {
  try {
    const { data: parts, error: partsErr } = await supabase
      .from("dm_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", viewerId);

    if (partsErr) {
      if (isMissingRelation(partsErr.message)) {
        return {
          threads: [],
          error: "Run direct messages SQL in Supabase.",
          missingTable: true,
        };
      }
      return { threads: [], error: partsErr.message, missingTable: false };
    }

    const myParts = parts ?? [];
    if (myParts.length === 0) {
      return { threads: [], error: null, missingTable: false };
    }

    const convIds = myParts.map((p) => p.conversation_id as string);
    const lastReadByConv = new Map<string, string | null>();
    for (const p of myParts) {
      lastReadByConv.set(
        p.conversation_id as string,
        typeof p.last_read_at === "string" ? p.last_read_at : null,
      );
    }

    const { data: convs, error: convErr } = await supabase
      .from("dm_conversations")
      .select("id, updated_at, participant_low, participant_high")
      .in("id", convIds)
      .order("updated_at", { ascending: false });

    if (convErr) {
      return { threads: [], error: convErr.message, missingTable: false };
    }

    const { data: others, error: othersErr } = await supabase
      .from("dm_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", convIds)
      .neq("user_id", viewerId);

    if (othersErr) {
      return { threads: [], error: othersErr.message, missingTable: false };
    }

    const otherByConv = new Map<string, string>();
    for (const row of others ?? []) {
      otherByConv.set(row.conversation_id as string, row.user_id as string);
    }

    const otherIds = [...new Set([...otherByConv.values()])];
    const { data: users } = otherIds.length
      ? await supabase
          .from("users")
          .select("id, display_name, avatar_url")
          .in("id", otherIds)
      : { data: [] as { id: string; display_name: string | null; avatar_url: string | null }[] };

    const userById = new Map(
      (users ?? []).map((u) => [u.id as string, u]),
    );

    // Latest message per conversation (best-effort)
    const { data: recentMsgs } = await supabase
      .from("dm_messages")
      .select("conversation_id, body, created_at, sender_id")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(convIds.length * 3, 200));

    const lastMsgByConv = new Map<
      string,
      { body: string; created_at: string; sender_id: string }
    >();
    for (const m of recentMsgs ?? []) {
      const cid = m.conversation_id as string;
      if (lastMsgByConv.has(cid)) continue;
      lastMsgByConv.set(cid, {
        body: String(m.body ?? ""),
        created_at: String(m.created_at ?? ""),
        sender_id: String(m.sender_id ?? ""),
      });
    }

    const threads: DmThread[] = [];
    for (const c of convs ?? []) {
      const cid = c.id as string;
      const otherId = otherByConv.get(cid);
      if (!otherId) continue;
      const u = userById.get(otherId) ?? null;
      const last = lastMsgByConv.get(cid);
      const lastRead = lastReadByConv.get(cid);
      const lastAt = last?.created_at ?? (c.updated_at as string);
      const unread = Boolean(
        last &&
          last.sender_id !== viewerId &&
          (!lastRead || new Date(last.created_at) > new Date(lastRead)),
      );

      threads.push({
        conversation_id: cid,
        other_id: otherId,
        other_name: displayName(u, "Listener"),
        other_avatar:
          typeof u?.avatar_url === "string" ? u.avatar_url : null,
        last_body: last?.body ?? null,
        last_at: lastAt ?? null,
        unread,
        updated_at: String(c.updated_at ?? lastAt ?? ""),
      });
    }

    return { threads, error: null, missingTable: false };
  } catch (e) {
    return {
      threads: [],
      error: e instanceof Error ? e.message : "Failed to load messages",
      missingTable: false,
    };
  }
}

export async function loadDmThread(
  supabase: SupabaseClient,
  viewerId: string,
  conversationId: string,
  limit = 80,
): Promise<{
  messages: DmMessage[];
  other_id: string | null;
  other_name: string;
  other_avatar: string | null;
  error: string | null;
  missingTable: boolean;
  notParticipant: boolean;
}> {
  try {
    const { data: me, error: meErr } = await supabase
      .from("dm_participants")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", viewerId)
      .maybeSingle();

    if (meErr) {
      if (isMissingRelation(meErr.message)) {
        return {
          messages: [],
          other_id: null,
          other_name: "Listener",
          other_avatar: null,
          error: "Run direct messages SQL in Supabase.",
          missingTable: true,
          notParticipant: false,
        };
      }
      return {
        messages: [],
        other_id: null,
        other_name: "Listener",
        other_avatar: null,
        error: meErr.message,
        missingTable: false,
        notParticipant: false,
      };
    }

    if (!me) {
      return {
        messages: [],
        other_id: null,
        other_name: "Listener",
        other_avatar: null,
        error: null,
        missingTable: false,
        notParticipant: true,
      };
    }

    const { data: otherRow } = await supabase
      .from("dm_participants")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .neq("user_id", viewerId)
      .maybeSingle();

    const otherId = (otherRow?.user_id as string) ?? null;
    let otherName = "Listener";
    let otherAvatar: string | null = null;
    if (otherId) {
      const { data: u } = await supabase
        .from("users")
        .select("display_name, avatar_url")
        .eq("id", otherId)
        .maybeSingle();
      otherName = displayName(u, "Listener");
      otherAvatar =
        typeof u?.avatar_url === "string" ? u.avatar_url : null;
    }

    const { data: msgs, error: msgErr } = await supabase
      .from("dm_messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (msgErr) {
      return {
        messages: [],
        other_id: otherId,
        other_name: otherName,
        other_avatar: otherAvatar,
        error: msgErr.message,
        missingTable: false,
        notParticipant: false,
      };
    }

    const messages: DmMessage[] = (msgs ?? []).map((m) => ({
      id: Number(m.id),
      conversation_id: String(m.conversation_id),
      sender_id: String(m.sender_id),
      body: String(m.body ?? ""),
      created_at: String(m.created_at),
      mine: String(m.sender_id) === viewerId,
    }));

    return {
      messages,
      other_id: otherId,
      other_name: otherName,
      other_avatar: otherAvatar,
      error: null,
      missingTable: false,
      notParticipant: false,
    };
  } catch (e) {
    return {
      messages: [],
      other_id: null,
      other_name: "Listener",
      other_avatar: null,
      error: e instanceof Error ? e.message : "Failed to load thread",
      missingTable: false,
      notParticipant: false,
    };
  }
}
