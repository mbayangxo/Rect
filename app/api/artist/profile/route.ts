import { NextResponse } from "next/server";
import { cleanCulturalList } from "@/lib/cultural-options";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  city?: unknown;
  artist_bio?: unknown;
  display_name?: unknown;
  countries?: unknown;
  genres?: unknown;
};

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

/** Update artist portal fields (city, bio, places, genres, optional display name). */
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
    const countries = cleanCulturalList(body.countries, 16);
    const genres = cleanCulturalList(body.genres, 16);

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

    if ("countries" in body && countries.length < 1) {
      return NextResponse.json(
        { error: "Pick at least one place so charts and radio can find you." },
        { status: 400 },
      );
    }

    if ("genres" in body && genres.length < 1) {
      return NextResponse.json(
        { error: "Pick at least one genre for Portals & Radio." },
        { status: 400 },
      );
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if ("city" in body) patch.city = city;
    if ("artist_bio" in body) patch.artist_bio = artist_bio;
    if ("display_name" in body && display_name) {
      patch.display_name = display_name;
    }
    if ("countries" in body) patch.countries = countries;
    if ("genres" in body) patch.genres = genres;

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
      .select(
        "id, display_name, city, artist_bio, countries, genres, role, account_type",
      )
      .maybeSingle();

    const meta: Record<string, unknown> = {};
    if ("city" in body) meta.city = city;
    if ("artist_bio" in body) meta.artist_bio = artist_bio;
    if ("display_name" in body && display_name) meta.display_name = display_name;
    if ("countries" in body) meta.countries = countries;
    if ("genres" in body) meta.genres = genres;
    if (Object.keys(meta).length > 0) {
      await supabase.auth.updateUser({ data: meta });
    }

    if (error) {
      return NextResponse.json(
        {
          error: `Could not save profile to users table: ${error.message}`,
          code: "users_update_failed",
        },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "Profile update matched no users row. Check RLS policies for public.users.",
          code: "users_update_empty",
        },
        { status: 500 },
      );
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
