import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PrivacyBody = {
  privacy_public_profile?: boolean;
  privacy_show_activity?: boolean;
  privacy_show_on_charts?: boolean;
};

/** Update privacy settings for the logged-in user. */
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

    let body: PrivacyBody;
    try {
      body = (await request.json()) as PrivacyBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const patch: Record<string, boolean> = {};
    if (typeof body.privacy_public_profile === "boolean") {
      patch.privacy_public_profile = body.privacy_public_profile;
    }
    if (typeof body.privacy_show_activity === "boolean") {
      patch.privacy_show_activity = body.privacy_show_activity;
    }
    if (typeof body.privacy_show_on_charts === "boolean") {
      patch.privacy_show_on_charts = body.privacy_show_on_charts;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No privacy fields to update." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("users")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select(
        "id, privacy_public_profile, privacy_show_activity, privacy_show_on_charts",
      )
      .maybeSingle();

    if (error) {
      // Columns may not exist yet — still persist to auth metadata
      await supabase.auth.updateUser({ data: patch });
      return NextResponse.json({
        ok: true,
        stored: "metadata",
        privacy: patch,
        warning: error.message,
      });
    }

    await supabase.auth.updateUser({ data: patch });

    return NextResponse.json({ ok: true, stored: "users", privacy: data });
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
