import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Promote the signed-in listener to artist on the same account.
 * Sets users.role + account_type and auth metadata — no new signup.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Sign in required.", authenticated: false },
        { status: 401 },
      );
    }

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const displayName =
      (typeof meta.display_name === "string" && meta.display_name.trim()) ||
      user.email?.split("@")[0] ||
      "Artist";

    const { data: existing } = await supabase
      .from("users")
      .select("id, role, account_type, display_name, countries, genres")
      .eq("id", user.id)
      .maybeSingle();

    const alreadyArtist =
      existing?.account_type === "artist" ||
      existing?.role === "artist" ||
      meta.account_type === "artist" ||
      meta.role === "artist";

    const places = Array.isArray(existing?.countries)
      ? existing.countries.filter((c): c is string => typeof c === "string")
      : Array.isArray(meta.countries)
        ? (meta.countries as unknown[]).filter(
            (c): c is string => typeof c === "string",
          )
        : [];
    const genres = Array.isArray(existing?.genres)
      ? existing.genres.filter((g): g is string => typeof g === "string")
      : Array.isArray(meta.genres)
        ? (meta.genres as unknown[]).filter(
            (g): g is string => typeof g === "string",
          )
        : [];
    const needsDiscoverability = places.length < 1 || genres.length < 1;
    const studioHref = needsDiscoverability
      ? "/studio/portal?setup=places"
      : "/studio/upload";

    if (alreadyArtist) {
      await supabase.auth.updateUser({
        data: {
          role: "artist",
          account_type: "artist",
        },
      });
      return NextResponse.json({
        ok: true,
        already: true,
        role: "artist",
        account_type: "artist",
        studio_href: studioHref,
        setup_places: needsDiscoverability,
      });
    }

    const patch = {
      id: user.id,
      display_name:
        (typeof existing?.display_name === "string" &&
          existing.display_name.trim()) ||
        displayName,
      role: "artist",
      account_type: "artist",
      email: user.email ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase.from("users").upsert(patch, {
      onConflict: "id",
    });

    if (upsertError) {
      // Fallback: update only role fields if upsert blocked
      const { error: updateError } = await supabase
        .from("users")
        .update({
          role: "artist",
          account_type: "artist",
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        // Still set auth metadata so hub/studio gates flip
        await supabase.auth.updateUser({
          data: {
            role: "artist",
            account_type: "artist",
          },
        });
        return NextResponse.json({
          ok: true,
          stored: "metadata",
          warning: updateError.message,
          role: "artist",
          account_type: "artist",
          studio_href: studioHref,
          setup_places: needsDiscoverability,
        });
      }
    }

    await supabase.auth.updateUser({
      data: {
        role: "artist",
        account_type: "artist",
        display_name: patch.display_name,
      },
    });

    return NextResponse.json({
      ok: true,
      stored: "users",
      already: false,
      role: "artist",
      account_type: "artist",
      studio_href: studioHref,
      setup_places: needsDiscoverability,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upgrade failed." },
      { status: 500 },
    );
  }
}
