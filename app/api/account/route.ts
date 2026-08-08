import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AccountBody = {
  display_name?: unknown;
  privacy_public_profile?: boolean;
  privacy_show_activity?: boolean;
  privacy_show_on_charts?: boolean;
};

function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().replace(/\s+/g, " ").slice(0, 48);
  return t.length > 0 ? t : null;
}

/** Update display name and/or privacy settings for the logged-in user. */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    let body: AccountBody;
    try {
      body = (await request.json()) as AccountBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const hasName = "display_name" in body;
    const display_name = hasName ? cleanDisplayName(body.display_name) : null;

    if (hasName) {
      if (!display_name || display_name.length < 2) {
        return NextResponse.json(
          { error: "Display name must be at least 2 characters." },
          { status: 400 },
        );
      }
    }

    const privacyPatch: Record<string, boolean> = {};
    if (typeof body.privacy_public_profile === "boolean") {
      privacyPatch.privacy_public_profile = body.privacy_public_profile;
    }
    if (typeof body.privacy_show_activity === "boolean") {
      privacyPatch.privacy_show_activity = body.privacy_show_activity;
    }
    if (typeof body.privacy_show_on_charts === "boolean") {
      privacyPatch.privacy_show_on_charts = body.privacy_show_on_charts;
    }

    if (!hasName && Object.keys(privacyPatch).length === 0) {
      return NextResponse.json(
        { error: "No account fields to update." },
        { status: 400 },
      );
    }

    const patch: Record<string, unknown> = {
      ...privacyPatch,
      updated_at: new Date().toISOString(),
    };
    if (hasName && display_name) {
      patch.display_name = display_name;
    }

    const { data, error } = await supabase
      .from("users")
      .update(patch)
      .eq("id", user.id)
      .select(
        "id, display_name, privacy_public_profile, privacy_show_activity, privacy_show_on_charts",
      )
      .maybeSingle();

    const meta: Record<string, unknown> = { ...privacyPatch };
    if (hasName && display_name) meta.display_name = display_name;
    await supabase.auth.updateUser({ data: meta });

    if (error) {
      return NextResponse.json({
        ok: true,
        stored: "metadata",
        display_name: hasName ? display_name : undefined,
        privacy: privacyPatch,
        warning: error.message,
      });
    }

    const row = data as {
      display_name?: string | null;
      privacy_public_profile?: boolean | null;
      privacy_show_activity?: boolean | null;
      privacy_show_on_charts?: boolean | null;
    } | null;

    return NextResponse.json({
      ok: true,
      stored: "users",
      display_name: row?.display_name ?? display_name,
      privacy: row
        ? {
            privacy_public_profile: Boolean(row.privacy_public_profile),
            privacy_show_activity: Boolean(row.privacy_show_activity),
            privacy_show_on_charts: Boolean(row.privacy_show_on_charts),
          }
        : privacyPatch,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed." },
      { status: 500 },
    );
  }
}

/** Permanently delete the logged-in account. */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        {
          error:
            "Account deletion is unavailable right now. Contact support.",
        },
        { status: 503 },
      );
    }

    const userId = user.id;

    // Best-effort cleanup of related rows
    await admin.from("plays").delete().eq("listener_id", userId);
    await admin.from("track_likes").delete().eq("user_id", userId);
    await admin.from("play_pack_purchases").delete().eq("user_id", userId);
    await admin.from("user_play_balances").delete().eq("user_id", userId);
    await admin.from("tracks").delete().eq("artist_id", userId);
    await admin.from("users").delete().eq("id", userId);

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 },
      );
    }

    await supabase.auth.signOut();

    return NextResponse.json({ ok: true, deleted: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed." },
      { status: 500 },
    );
  }
}
