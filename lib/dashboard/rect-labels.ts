import type { SupabaseClient } from "@supabase/supabase-js";

function isMissing(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type RectLabel = {
  id: string;
  owner_id: string;
  name: string;
  slug: string | null;
  bio: string | null;
  created_at: string;
};

export type LabelMembership = {
  id: string;
  label_id: string;
  artist_id: string;
  status: "pending" | "accepted" | "declined" | "ended";
  invited_by: string;
  awaiting_user_id: string | null;
  artist_accepted_at: string | null;
  label_accepted_at: string | null;
  revenue_split_label_pct: number;
  created_at: string;
  label_name?: string;
  artist_name?: string;
};

function mapLabel(row: Record<string, unknown>): RectLabel {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    name: String(row.name ?? "Label"),
    slug: typeof row.slug === "string" ? row.slug : null,
    bio: typeof row.bio === "string" ? row.bio : null,
    created_at: String(row.created_at ?? ""),
  };
}

function mapMembership(row: Record<string, unknown>): LabelMembership {
  return {
    id: String(row.id),
    label_id: String(row.label_id),
    artist_id: String(row.artist_id),
    status: (row.status as LabelMembership["status"]) || "pending",
    invited_by: String(row.invited_by),
    awaiting_user_id:
      typeof row.awaiting_user_id === "string" ? row.awaiting_user_id : null,
    artist_accepted_at:
      typeof row.artist_accepted_at === "string"
        ? row.artist_accepted_at
        : null,
    label_accepted_at:
      typeof row.label_accepted_at === "string" ? row.label_accepted_at : null,
    revenue_split_label_pct: Number(row.revenue_split_label_pct) || 20,
    created_at: String(row.created_at ?? ""),
  };
}

export async function createRectLabel(
  supabase: SupabaseClient,
  name: string,
): Promise<
  | { ok: true; label_id: string }
  | { ok: false; error: string; missingTable?: boolean }
> {
  const { data, error } = await supabase.rpc("create_rect_label", {
    p_name: name.trim(),
  });
  if (error) {
    if (isMissing(error.message)) {
      return {
        ok: false,
        error: "Run 20260903_rect_labels.sql in Supabase.",
        missingTable: true,
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, label_id: String(data) };
}

export async function loadOwnedLabel(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<{ label: RectLabel | null; missingTable: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from("rect_labels")
    .select("id, owner_id, name, slug, bio, created_at")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) {
    if (isMissing(error.message)) {
      return { label: null, missingTable: true, error: null };
    }
    return { label: null, missingTable: false, error: error.message };
  }
  if (!data) return { label: null, missingTable: false, error: null };
  return {
    label: mapLabel(data as Record<string, unknown>),
    missingTable: false,
    error: null,
  };
}

export async function loadLabelMemberships(
  supabase: SupabaseClient,
  labelId: string,
): Promise<{ members: LabelMembership[]; error: string | null }> {
  const { data, error } = await supabase
    .from("rect_label_memberships")
    .select(
      "id, label_id, artist_id, status, invited_by, awaiting_user_id, artist_accepted_at, label_accepted_at, revenue_split_label_pct, created_at",
    )
    .eq("label_id", labelId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissing(error.message)) return { members: [], error: null };
    return { members: [], error: error.message };
  }

  const members = ((data ?? []) as Record<string, unknown>[]).map(mapMembership);
  const artistIds = [...new Set(members.map((m) => m.artist_id))];
  if (artistIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, display_name")
      .in("id", artistIds);
    const names = new Map(
      (users ?? []).map((u) => [
        String(u.id),
        (typeof u.display_name === "string" && u.display_name.trim()) || "Artist",
      ]),
    );
    for (const m of members) {
      m.artist_name = names.get(m.artist_id);
    }
  }
  return { members, error: null };
}

export async function loadArtistLabelMemberships(
  supabase: SupabaseClient,
  artistId: string,
): Promise<{ members: LabelMembership[]; missingTable: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from("rect_label_memberships")
    .select(
      "id, label_id, artist_id, status, invited_by, awaiting_user_id, artist_accepted_at, label_accepted_at, revenue_split_label_pct, created_at",
    )
    .eq("artist_id", artistId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissing(error.message)) {
      return { members: [], missingTable: true, error: null };
    }
    return { members: [], missingTable: false, error: error.message };
  }

  const members = ((data ?? []) as Record<string, unknown>[]).map(mapMembership);
  const labelIds = [...new Set(members.map((m) => m.label_id))];
  if (labelIds.length > 0) {
    const { data: labels } = await supabase
      .from("rect_labels")
      .select("id, name")
      .in("id", labelIds);
    const names = new Map(
      (labels ?? []).map((l) => [String(l.id), String(l.name ?? "Label")]),
    );
    for (const m of members) {
      m.label_name = names.get(m.label_id);
    }
  }
  return { members, missingTable: false, error: null };
}

/** Label invites artist — awaiting artist accept. Artist can also request (awaiting label). */
export async function inviteLabelArtist(
  supabase: SupabaseClient,
  input: {
    labelId: string;
    artistId: string;
    invitedBy: string;
    labelOwnerId: string;
    splitPct?: number;
  },
): Promise<
  | { ok: true; membership: LabelMembership }
  | { ok: false; error: string; missingTable?: boolean }
> {
  const fromLabel = input.invitedBy === input.labelOwnerId;
  const fromArtist = input.invitedBy === input.artistId;
  if (!fromLabel && !fromArtist) {
    return { ok: false, error: "Only the label or the artist can invite." };
  }

  const now = new Date().toISOString();
  const row = {
    label_id: input.labelId,
    artist_id: input.artistId,
    status: "pending",
    invited_by: input.invitedBy,
    awaiting_user_id: fromLabel ? input.artistId : input.labelOwnerId,
    artist_accepted_at: fromArtist ? now : null,
    label_accepted_at: fromLabel ? now : null,
    revenue_split_label_pct: input.splitPct ?? 20,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("rect_label_memberships")
    .upsert(row, { onConflict: "label_id,artist_id" })
    .select(
      "id, label_id, artist_id, status, invited_by, awaiting_user_id, artist_accepted_at, label_accepted_at, revenue_split_label_pct, created_at",
    )
    .maybeSingle();

  if (error) {
    if (isMissing(error.message)) {
      return {
        ok: false,
        error: "Run 20260903_rect_labels.sql in Supabase.",
        missingTable: true,
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Invite failed." };
  return { ok: true, membership: mapMembership(data as Record<string, unknown>) };
}

export async function respondLabelMembership(
  supabase: SupabaseClient,
  membershipId: string,
  userId: string,
  accept: boolean,
): Promise<
  | { ok: true; membership: LabelMembership }
  | { ok: false; error: string }
> {
  const { data: existing, error: loadErr } = await supabase
    .from("rect_label_memberships")
    .select(
      "id, label_id, artist_id, status, invited_by, awaiting_user_id, artist_accepted_at, label_accepted_at, revenue_split_label_pct, created_at",
    )
    .eq("id", membershipId)
    .maybeSingle();

  if (loadErr || !existing) {
    return { ok: false, error: loadErr?.message || "Membership not found." };
  }

  const m = mapMembership(existing as Record<string, unknown>);
  const { data: label } = await supabase
    .from("rect_labels")
    .select("owner_id")
    .eq("id", m.label_id)
    .maybeSingle();
  const ownerId = label ? String(label.owner_id) : null;

  const isArtist = m.artist_id === userId;
  const isLabel = ownerId === userId;
  if (!isArtist && !isLabel) {
    return { ok: false, error: "Not a party to this invite." };
  }

  if (!accept) {
    const { data, error } = await supabase
      .from("rect_label_memberships")
      .update({
        status: "declined",
        awaiting_user_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", membershipId)
      .select(
        "id, label_id, artist_id, status, invited_by, awaiting_user_id, artist_accepted_at, label_accepted_at, revenue_split_label_pct, created_at",
      )
      .maybeSingle();
    if (error || !data) return { ok: false, error: error?.message || "Decline failed." };
    return { ok: true, membership: mapMembership(data as Record<string, unknown>) };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (isArtist) patch.artist_accepted_at = now;
  if (isLabel) patch.label_accepted_at = now;

  const artistOk = isArtist || Boolean(m.artist_accepted_at);
  const labelOk = isLabel || Boolean(m.label_accepted_at);
  if (artistOk && labelOk) {
    patch.status = "accepted";
    patch.awaiting_user_id = null;
  } else {
    patch.status = "pending";
    patch.awaiting_user_id = artistOk ? ownerId : m.artist_id;
  }

  const { data, error } = await supabase
    .from("rect_label_memberships")
    .update(patch)
    .eq("id", membershipId)
    .select(
      "id, label_id, artist_id, status, invited_by, awaiting_user_id, artist_accepted_at, label_accepted_at, revenue_split_label_pct, created_at",
    )
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message || "Accept failed." };
  }
  return { ok: true, membership: mapMembership(data as Record<string, unknown>) };
}
