import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  city?: unknown;
  artist_bio?: unknown;
  display_name?: unknown;
};

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

/** Update artist portal fields (city, bio, optional display name). */
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

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const city = cleanText(body.city, 80);
    const artist_bio = cleanText(body.artist_bio, 500);
    const display_name = cleanText(body.display_name, 48);

    if (
      body.display_name !== undefined &&
      display_name !== null &&
      display_name.length < 2
    ) {
      return NextResponse.json(
        { error: "Display name must be at least 2 characters." },
        { status: 400 },
      );
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Always allow clearing with empty string → null
    if ("city" in body) patch.city = city;
    if ("artist_bio" in body) patch.artist_bio = artist_bio;
    if ("display_name" in body && display_name) {
      patch.display_name = display_name;
    }

    if (Object.keys(patch).length <= 1) {
      return NextResponse.json(
        { error: "No profile fields to update." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("users")
      .update(patch)
      .eq("id", user.id)
      .select("id, display_name, city, artist_bio, role, account_type")
      .maybeSingle();

    const meta: Record<string, unknown> = {};
    if ("city" in body) meta.city = city;
    if ("artist_bio" in body) meta.artist_bio = artist_bio;
    if ("display_name" in body && display_name) meta.display_name = display_name;
    if (Object.keys(meta).length > 0) {
      await supabase.auth.updateUser({ data: meta });
    }

    if (error) {
      return NextResponse.json({
        ok: true,
        stored: "metadata",
        profile: meta,
        warning: error.message,
      });
    }

    return NextResponse.json({
      ok: true,
      stored: "users",
      profile: data,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed." },
      { status: 500 },
    );
  }
}
