import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeTrackGenre,
  normalizeTrackLanguage,
} from "@/lib/cultural-options";
import { createClient } from "@/lib/supabase/server";
import { isPublishedTrack, TRACKS_BUCKET } from "@/lib/tracks";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type PatchBody = {
  title?: string;
  genre?: string | null;
  language?: string | null;
  duration_secs?: number | null;
  download_price_xof?: number | null;
  lyrics?: string | null;
  /** ISO timestamptz or null to clear (immediate New Sounds). */
  launch_at?: string | null;
};

const MAX_LYRICS_CHARS = 20_000;

function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const marker = `/object/public/${TRACKS_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
    }
    // Alternate CDN-style paths
    const alt = `/storage/v1/object/public/${TRACKS_BUCKET}/`;
    const altIdx = url.indexOf(alt);
    if (altIdx >= 0) {
      return decodeURIComponent(url.slice(altIdx + alt.length).split("?")[0]);
    }
  } catch {
    return null;
  }
  return null;
}

/** Artist updates own track title / genre. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const trackId = id?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "Track id required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (title.length < 1 || title.length > 120) {
      return NextResponse.json(
        { error: "Title must be 1–120 characters." },
        { status: 400 },
      );
    }
    patch.title = title;
  }
  if (body.genre !== undefined) {
    if (body.genre === null) {
      patch.genre = null;
    } else if (typeof body.genre === "string") {
      patch.genre = normalizeTrackGenre(body.genre);
    } else {
      return NextResponse.json({ error: "Invalid genre." }, { status: 400 });
    }
  }

  if (body.language !== undefined) {
    if (body.language === null) {
      patch.language = null;
    } else if (typeof body.language === "string") {
      patch.language = normalizeTrackLanguage(body.language);
    } else {
      return NextResponse.json({ error: "Invalid language." }, { status: 400 });
    }
  }

  if (body.duration_secs !== undefined) {
    if (body.duration_secs === null) {
      patch.duration_secs = null;
    } else if (
      typeof body.duration_secs === "number" &&
      Number.isFinite(body.duration_secs) &&
      body.duration_secs > 0 &&
      body.duration_secs <= 7200
    ) {
      patch.duration_secs = Math.round(body.duration_secs);
    } else {
      return NextResponse.json(
        { error: "duration_secs must be 1–7200." },
        { status: 400 },
      );
    }
  }

  if (body.download_price_xof !== undefined) {
    if (body.download_price_xof === null) {
      patch.download_price_xof = null;
    } else if (
      typeof body.download_price_xof === "number" &&
      Number.isFinite(body.download_price_xof) &&
      body.download_price_xof >= 0
    ) {
      patch.download_price_xof = Math.round(body.download_price_xof);
    } else {
      return NextResponse.json(
        { error: "download_price_xof must be 0 or greater." },
        { status: 400 },
      );
    }
  }

  if (body.lyrics !== undefined) {
    if (body.lyrics === null) {
      patch.lyrics = null;
    } else if (typeof body.lyrics === "string") {
      const lyrics = body.lyrics.trim();
      if (lyrics.length > MAX_LYRICS_CHARS) {
        return NextResponse.json(
          {
            error: `Lyrics must be under ${MAX_LYRICS_CHARS.toLocaleString()} characters.`,
          },
          { status: 400 },
        );
      }
      patch.lyrics = lyrics.length ? lyrics : null;
    } else {
      return NextResponse.json({ error: "Invalid lyrics." }, { status: 400 });
    }
  }

  if (body.launch_at !== undefined) {
    if (body.launch_at === null || body.launch_at === "") {
      patch.launch_at = null;
    } else if (typeof body.launch_at === "string") {
      const at = new Date(body.launch_at);
      if (Number.isNaN(at.getTime())) {
        return NextResponse.json(
          { error: "launch_at must be a valid date/time." },
          { status: 400 },
        );
      }
      patch.launch_at = at.toISOString();
    } else {
      return NextResponse.json({ error: "Invalid launch_at." }, { status: 400 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      {
        error:
          "Provide title, genre, language, duration_secs, download_price_xof, lyrics, and/or launch_at.",
      },
      { status: 400 },
    );
  }

  const { data: existing, error: findError } = await supabase
    .from("tracks")
    .select("id, artist_id, status, genre, language")
    .eq("id", trackId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }
  if (existing.artist_id !== user.id) {
    return NextResponse.json({ error: "Not your track." }, { status: 403 });
  }

  if (isPublishedTrack(existing)) {
    const nextGenre =
      patch.genre !== undefined
        ? normalizeTrackGenre(
            typeof patch.genre === "string" ? patch.genre : "",
          )
        : normalizeTrackGenre(
            typeof existing.genre === "string" ? existing.genre : "",
          );
    const nextLanguage =
      patch.language !== undefined
        ? normalizeTrackLanguage(
            typeof patch.language === "string" ? patch.language : "",
          )
        : normalizeTrackLanguage(
            typeof existing.language === "string" ? existing.language : "",
          );

    if (!nextGenre || !nextLanguage) {
      return NextResponse.json(
        {
          error:
            "Live tracks need genre and language — unpublish to clear them.",
          code: "live_metadata",
        },
        { status: 400 },
      );
    }

    // Persist normalized values when the client sent empties or aliases.
    if (patch.genre !== undefined) patch.genre = nextGenre;
    if (patch.language !== undefined) patch.language = nextLanguage;
  }

  const { data, error } = await supabase
    .from("tracks")
    .update(patch)
    .eq("id", trackId)
    .eq("artist_id", user.id)
    .select("id, title, genre, language, status, artist_id, download_price_xof, lyrics")
    .maybeSingle();

  if (error) {
    if (/lyrics|download_price_xof|column .* does not exist/i.test(error.message)) {
      const leanPatch = Object.fromEntries(
        Object.entries(patch).filter(
          ([k]) => k !== "download_price_xof" && k !== "lyrics",
        ),
      );
      if (Object.keys(leanPatch).length === 0 && patch.lyrics !== undefined) {
        return NextResponse.json(
          {
            error:
              "Run 20260830_track_lyrics.sql in Supabase to enable lyrics.",
          },
          { status: 503 },
        );
      }
      const lean = await supabase
        .from("tracks")
        .update(leanPatch)
        .eq("id", trackId)
        .eq("artist_id", user.id)
        .select("id, title, genre, language, status, artist_id")
        .maybeSingle();
      if (lean.error) {
        return NextResponse.json({ error: lean.error.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        track: lean.data,
        warning: /lyrics/i.test(error.message)
          ? "Run 20260830_track_lyrics.sql for lyrics."
          : "Run 20260830_monetization_stack.sql for download pricing.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, track: data });
}

/** Artist deletes own track row + storage files. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const trackId = id?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "Track id required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { data: existing, error: findError } = await supabase
    .from("tracks")
    .select("id, artist_id, audio_url, cover_art_url, title")
    .eq("id", trackId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }
  if (existing.artist_id !== user.id) {
    return NextResponse.json({ error: "Not your track." }, { status: 403 });
  }

  const paths = [
    storagePathFromPublicUrl(existing.audio_url as string | null),
    storagePathFromPublicUrl(existing.cover_art_url as string | null),
  ].filter(Boolean) as string[];

  const admin = createAdminClient();
  const db = admin ?? supabase;

  // Best-effort related cleanup (likes / playlist links / notifications)
  if (admin) {
    await admin.from("track_likes").delete().eq("track_id", trackId);
    await admin.from("playlist_tracks").delete().eq("track_id", trackId);
    await admin
      .from("artist_notifications")
      .delete()
      .eq("track_id", trackId);
  }

  const { error: deleteError } = await db
    .from("tracks")
    .delete()
    .eq("id", trackId)
    .eq("artist_id", user.id);

  if (deleteError) {
    // Retry with admin if RLS blocks delete
    if (admin && db !== admin) {
      const adminDel = await admin
        .from("tracks")
        .delete()
        .eq("id", trackId)
        .eq("artist_id", user.id);
      if (adminDel.error) {
        return NextResponse.json(
          { error: adminDel.error.message },
          { status: 500 },
        );
      }
    } else {
      return NextResponse.json(
        {
          error: deleteError.message,
          hint: "Add tracks_delete_own RLS if missing",
        },
        { status: 500 },
      );
    }
  }

  if (admin && paths.length > 0) {
    await admin.storage.from(TRACKS_BUCKET).remove(paths);
  }

  return NextResponse.json({
    ok: true,
    track_id: trackId,
    removed_files: paths.length,
  });
}
