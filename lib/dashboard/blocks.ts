import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

function isMissingRelation(message: string) {
  return /relation .* does not exist|Could not find the table|PGRST205|function .* does not exist|PGRST202/i.test(
    message,
  );
}

export type BlockedPerson = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  blocked_at: string | null;
};

export async function loadIsBlocked(
  supabase: SupabaseClient,
  blockerId: string,
  blockedId: string,
): Promise<{ blocked: boolean; missingTable: boolean }> {
  try {
    const { data, error } = await supabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", blockerId)
      .eq("blocked_id", blockedId)
      .maybeSingle();

    if (error) {
      if (isMissingRelation(error.message)) {
        return { blocked: false, missingTable: true };
      }
      return { blocked: false, missingTable: false };
    }
    return { blocked: Boolean(data), missingTable: false };
  } catch {
    return { blocked: false, missingTable: false };
  }
}

export async function loadUsersAreBlocked(
  supabase: SupabaseClient,
  a: string,
  b: string,
): Promise<{ blocked: boolean; missingTable: boolean }> {
  try {
    const { data, error } = await supabase.rpc("users_are_blocked", {
      p_a: a,
      p_b: b,
    });
    if (error) {
      if (isMissingRelation(error.message)) {
        return { blocked: false, missingTable: true };
      }
      // Fallback to direct select either direction
      const either = await supabase
        .from("user_blocks")
        .select("blocker_id")
        .or(
          `and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`,
        )
        .limit(1);
      if (either.error && isMissingRelation(either.error.message)) {
        return { blocked: false, missingTable: true };
      }
      return {
        blocked: (either.data?.length ?? 0) > 0,
        missingTable: false,
      };
    }
    return { blocked: Boolean(data), missingTable: false };
  } catch {
    return { blocked: false, missingTable: false };
  }
}

/** Ids the viewer has blocked (outgoing). */
export async function loadBlockedUserIds(
  supabase: SupabaseClient,
  viewerId: string,
): Promise<{ ids: string[]; missingTable: boolean }> {
  try {
    const { data, error } = await supabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", viewerId);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { ids: [], missingTable: true };
      }
      return { ids: [], missingTable: false };
    }

    return {
      ids: (data ?? []).map((r) => r.blocked_id as string).filter(Boolean),
      missingTable: false,
    };
  } catch {
    return { ids: [], missingTable: false };
  }
}

/** People the viewer has blocked, with display names (for settings). */
export async function loadBlockedPeople(
  supabase: SupabaseClient,
  viewerId: string,
  limit = 80,
): Promise<{
  people: BlockedPerson[];
  missingTable: boolean;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("user_blocks")
      .select("blocked_id, created_at")
      .eq("blocker_id", viewerId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { people: [], missingTable: true, error: null };
      }
      return { people: [], missingTable: false, error: error.message };
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return { people: [], missingTable: false, error: null };
    }

    const ids = rows
      .map((r) => r.blocked_id as string)
      .filter(Boolean);
    const blockedAt = new Map(
      rows.map((r) => [
        r.blocked_id as string,
        (r.created_at as string | null) ?? null,
      ]),
    );

    const admin = createAdminClient();
    const db = admin ?? supabase;

    let userRows: Record<string, unknown>[] | null = null;
    const full = await db
      .from("users")
      .select("id, display_name, avatar_url")
      .in("id", ids);

    if (
      full.error &&
      /avatar_url|column .* does not exist/i.test(full.error.message)
    ) {
      const lean = await db
        .from("users")
        .select("id, display_name")
        .in("id", ids);
      if (lean.error) {
        return { people: [], missingTable: false, error: lean.error.message };
      }
      userRows = (lean.data ?? []) as Record<string, unknown>[];
    } else if (full.error) {
      return { people: [], missingTable: false, error: full.error.message };
    } else {
      userRows = (full.data ?? []) as Record<string, unknown>[];
    }

    const byId = new Map(
      (userRows ?? []).map((row) => [row.id as string, row]),
    );

    const people: BlockedPerson[] = ids.map((id) => {
      const row = byId.get(id);
      return {
        id,
        display_name:
          (typeof row?.display_name === "string" && row.display_name.trim()) ||
          "Listener",
        avatar_url:
          typeof row?.avatar_url === "string" && row.avatar_url.trim()
            ? row.avatar_url.trim()
            : null,
        blocked_at: blockedAt.get(id) ?? null,
      };
    });

    return { people, missingTable: false, error: null };
  } catch (err) {
    return {
      people: [],
      missingTable: false,
      error: err instanceof Error ? err.message : "Failed to load blocks",
    };
  }
}

/** Ids who blocked the viewer OR whom the viewer blocked (either direction). */
export async function loadBlockedEitherIds(
  supabase: SupabaseClient,
  viewerId: string,
): Promise<{ ids: string[]; missingTable: boolean }> {
  try {
    const { data, error } = await supabase
      .from("user_blocks")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`);

    if (error) {
      if (isMissingRelation(error.message)) {
        return { ids: [], missingTable: true };
      }
      return { ids: [], missingTable: false };
    }

    const ids = new Set<string>();
    for (const r of data ?? []) {
      const a = r.blocker_id as string;
      const b = r.blocked_id as string;
      if (a === viewerId && b) ids.add(b);
      if (b === viewerId && a) ids.add(a);
    }
    return { ids: [...ids], missingTable: false };
  } catch {
    return { ids: [], missingTable: false };
  }
}

export async function toggleUserBlock(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  | { ok: true; blocked: boolean; user_id: string }
  | {
      ok: false;
      error: string;
      code?:
        | "not_authenticated"
        | "cannot_block_self"
        | "missing_table"
        | "failed";
    }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Sign in required",
      code: "not_authenticated",
    };
  }
  if (user.id === userId) {
    return {
      ok: false,
      error: "You can’t block yourself",
      code: "cannot_block_self",
    };
  }

  const { data, error } = await supabase.rpc("toggle_user_block", {
    p_user_id: userId,
  });

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        ok: false,
        error: "Run user blocks SQL in Supabase first",
        code: "missing_table",
      };
    }
    if (/cannot_block_self/i.test(error.message)) {
      return {
        ok: false,
        error: "You can’t block yourself",
        code: "cannot_block_self",
      };
    }
    return { ok: false, error: error.message, code: "failed" };
  }

  const row = data as { blocked?: boolean; user_id?: string } | null;
  return {
    ok: true,
    blocked: Boolean(row?.blocked),
    user_id: String(row?.user_id ?? userId),
  };
}
