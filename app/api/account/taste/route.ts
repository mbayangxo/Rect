import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TasteBody = {
  countries?: unknown;
  genres?: unknown;
  languages?: unknown;
  listening_times?: unknown;
};

function cleanList(value: unknown, max = 40): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t || out.includes(t)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Update cultural taste for the logged-in listener (drives For You). */
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

    let body: TasteBody;
    try {
      body = (await request.json()) as TasteBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const countries = cleanList(body.countries);
    const genres = cleanList(body.genres);
    const languages = cleanList(body.languages);
    const listening_times = cleanList(body.listening_times, 8);

    if (countries.length < 1) {
      return NextResponse.json(
        { error: "Select at least one place you're from." },
        { status: 400 },
      );
    }
    if (genres.length < 1) {
      return NextResponse.json(
        { error: "Select at least one genre that moves you." },
        { status: 400 },
      );
    }
    if (languages.length < 1) {
      return NextResponse.json(
        { error: "Select at least one language." },
        { status: 400 },
      );
    }
    if (listening_times.length < 1) {
      return NextResponse.json(
        { error: "Select at least one listening time." },
        { status: 400 },
      );
    }

    const patch = {
      countries,
      genres,
      languages,
      listening_times,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("users")
      .update(patch)
      .eq("id", user.id)
      .select("id, countries, genres, languages, listening_times")
      .maybeSingle();

    const meta = {
      countries,
      genres,
      languages,
      listening_times,
    };
    await supabase.auth.updateUser({ data: meta });

    if (error) {
      return NextResponse.json({
        ok: true,
        stored: "metadata",
        taste: meta,
        warning: error.message,
      });
    }

    return NextResponse.json({
      ok: true,
      stored: "users",
      taste: data ?? meta,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed." },
      { status: 500 },
    );
  }
}
