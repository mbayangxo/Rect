import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import {
  normalizeTrackGenre,
  normalizeTrackLanguage,
} from "@/lib/cultural-options";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteClient } from "@/lib/supabase/route";
import { TRACKS_BUCKET, isPublishedTrack, trackStatusForWrite } from "@/lib/tracks";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const ALLOWED_AUDIO = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
]);
const ALLOWED_COVER = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

type StorageDb = {
  storage: {
    listBuckets: () => Promise<{ data: { id?: string; name?: string }[] | null }>;
    createBucket: (
      id: string,
      opts: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer,
        opts: { contentType: string; upsert: boolean },
      ) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      remove: (paths: string[]) => Promise<unknown>;
    };
  };
  from: (table: string) => {
    upsert: (row: Record<string, unknown>) => Promise<unknown>;
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          select: (cols: string) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    delete: () => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => Promise<unknown>;
      };
    };
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
};

async function ensureTracksBucket(admin: StorageDb) {
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = buckets?.some(
    (b) => b.id === TRACKS_BUCKET || b.name === TRACKS_BUCKET,
  );
  if (exists) return;

  const { error } = await admin.storage.createBucket(TRACKS_BUCKET, {
    public: true,
    fileSizeLimit: MAX_AUDIO_BYTES,
    allowedMimeTypes: [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/mp4",
      "audio/aac",
      "audio/ogg",
      "audio/webm",
      "image/jpeg",
      "image/png",
      "image/webp",
    ],
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Could not create storage bucket: ${error.message}`);
  }
}

function safeExt(name: string, mime: string) {
  const fromName = name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("aac") || mime.includes("mp4")) return "m4a";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "mp3";
}

export async function POST(request: Request) {
  const supabase = await createRouteClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  // Prefer service role when configured; otherwise use the signed-in user
  // (RLS: tracks_insert_own + tracks_storage_insert_own).
  const admin = createAdminClient();
  const db = (admin ?? supabase) as unknown as StorageDb;
  const usingAdmin = Boolean(admin);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  const title = String(form.get("title") ?? "").trim();
  const genre = normalizeTrackGenre(String(form.get("genre") ?? ""));
  const language = normalizeTrackLanguage(String(form.get("language") ?? ""));
  const publishRaw = String(form.get("publish") ?? "").trim().toLowerCase();
  const publish =
    publishRaw === "1" ||
    publishRaw === "true" ||
    publishRaw === "yes" ||
    publishRaw === "publish";
  const writersRaw = String(form.get("writers") ?? "").trim();
  let writers: { name: string; percent: number }[] | null = null;
  if (writersRaw) {
    try {
      const parsed = JSON.parse(writersRaw) as unknown;
      if (!Array.isArray(parsed) || parsed.length < 1) {
        return NextResponse.json(
          { error: "Writer splits are required." },
          { status: 400 },
        );
      }
      writers = [];
      let total = 0;
      for (const item of parsed) {
        const row = item as { name?: unknown; percent?: unknown };
        const name =
          typeof row.name === "string" ? row.name.trim().slice(0, 120) : "";
        const percent = Number(row.percent);
        if (!name) {
          return NextResponse.json(
            { error: "Each writer needs a name." },
            { status: 400 },
          );
        }
        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
          return NextResponse.json(
            { error: "Each split must be between 0 and 100%." },
            { status: 400 },
          );
        }
        writers.push({ name, percent: Math.round(percent * 100) / 100 });
        total += percent;
      }
      if (Math.abs(total - 100) > 0.01) {
        return NextResponse.json(
          { error: "Writer splits must total 100%." },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid writer splits." },
        { status: 400 },
      );
    }
  }
  const durationRaw = String(form.get("duration_secs") ?? "").trim();
  const durationParsed = durationRaw ? Number(durationRaw) : NaN;
  const duration_secs =
    Number.isFinite(durationParsed) &&
    durationParsed > 0 &&
    durationParsed <= 7200
      ? Math.round(durationParsed)
      : null;
  const audio = form.get("audio");
  const cover = form.get("cover");

  if (title.length < 1 || title.length > 120) {
    return NextResponse.json(
      { error: "Title must be 1–120 characters." },
      { status: 400 },
    );
  }
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json(
      { error: "Audio file is required." },
      { status: 400 },
    );
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Audio file must be under 50MB." },
      { status: 400 },
    );
  }
  const mime = audio.type || "audio/mpeg";
  if (mime && !ALLOWED_AUDIO.has(mime) && !mime.startsWith("audio/")) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${mime}` },
      { status: 400 },
    );
  }

  let coverFile: File | null = null;
  if (cover instanceof File && cover.size > 0) {
    if (cover.size > MAX_COVER_BYTES) {
      return NextResponse.json(
        { error: "Cover image must be under 5MB." },
        { status: 400 },
      );
    }
    const coverMime = cover.type || "image/jpeg";
    if (!ALLOWED_COVER.has(coverMime) && !coverMime.startsWith("image/")) {
      return NextResponse.json(
        { error: `Unsupported cover type: ${coverMime}` },
        { status: 400 },
      );
    }
    coverFile = cover;
  }

  if (publish && !coverFile) {
    return NextResponse.json(
      {
        error:
          "Cover art is required before going live — Charts and Home need artwork.",
        code: "cover_required",
      },
      { status: 400 },
    );
  }

  // Soft artist gate — listeners should use become-artist first.
  const { data: profile } = await supabase
    .from("users")
    .select("account_type, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isArtistAccount(profile, user)) {
    return NextResponse.json(
      { error: "Artist account required. Switch to artist mode from Profile." },
      { status: 403 },
    );
  }

  if (usingAdmin) {
    try {
      await ensureTracksBucket(db);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Bucket setup failed" },
        { status: 500 },
      );
    }
  }

  const ext = safeExt(audio.name || "track.mp3", mime);
  const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await audio.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from(TRACKS_BUCKET)
    .upload(path, buffer, {
      contentType: mime || "audio/mpeg",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: pub } = db.storage.from(TRACKS_BUCKET).getPublicUrl(path);
  const audio_url = pub.publicUrl;

  let cover_art_url: string | null = null;
  const uploadedPaths = [path];

  if (coverFile) {
    const coverMime = coverFile.type || "image/jpeg";
    const coverExt = safeExt(coverFile.name || "cover.jpg", coverMime);
    const coverPath = `${user.id}/covers/${Date.now()}-${crypto.randomUUID()}.${coverExt}`;
    const coverBuffer = Buffer.from(await coverFile.arrayBuffer());
    const { error: coverError } = await db.storage
      .from(TRACKS_BUCKET)
      .upload(coverPath, coverBuffer, {
        contentType: coverMime,
        upsert: false,
      });
    if (coverError) {
      await db.storage.from(TRACKS_BUCKET).remove(uploadedPaths);
      return NextResponse.json(
        { error: `Cover upload failed: ${coverError.message}` },
        { status: 500 },
      );
    }
    uploadedPaths.push(coverPath);
    const { data: coverPub } = db.storage
      .from(TRACKS_BUCKET)
      .getPublicUrl(coverPath);
    cover_art_url = coverPub.publicUrl;
  }

  const displayName =
    (typeof user.user_metadata?.display_name === "string" &&
      user.user_metadata.display_name) ||
    user.email?.split("@")[0] ||
    "Artist";

  await db.from("users").upsert({
    id: user.id,
    display_name: displayName,
    role: "artist",
    account_type: "artist",
    email: user.email ?? null,
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  });

  await supabase.auth.updateUser({
    data: {
      role: "artist",
      account_type: "artist",
    },
  });

  const insertPayload: Record<string, unknown> = {
    title,
    genre,
    audio_url,
    artist_id: user.id,
  };
  if (cover_art_url) insertPayload.cover_art_url = cover_art_url;
  if (duration_secs != null) insertPayload.duration_secs = duration_secs;
  if (language) insertPayload.language = language;

  let workingPayload = { ...insertPayload };
  const liveStatus = trackStatusForWrite("live");
  const draftStatus = trackStatusForWrite("pending");

  // Publish = live only. Draft = pending only. No silent status swaps.
  const attempts = publish
    ? [
        () => ({ ...workingPayload, status: liveStatus }),
        () => ({ ...workingPayload, status: "published" }),
      ]
    : [() => ({ ...workingPayload, status: draftStatus })];

  let track: Record<string, unknown> | null = null;
  let lastError: string | null = null;

  for (const build of attempts) {
    const row = build();
    const { data, error } = await db
      .from("tracks")
      .insert(row)
      .select("*")
      .maybeSingle();
    if (!error && data) {
      track = data;
      break;
    }
    lastError = error?.message ?? "insert failed";
    if (error && /cover_art_url|column .* does not exist/i.test(error.message)) {
      delete workingPayload.cover_art_url;
      cover_art_url = null;
      continue;
    }
    if (error && /language|column .* does not exist/i.test(error.message)) {
      delete workingPayload.language;
      continue;
    }
    if (
      error &&
      /duration_secs|column .* does not exist/i.test(error.message)
    ) {
      delete workingPayload.duration_secs;
      continue;
    }
  }

  if (!track) {
    await db.storage.from(TRACKS_BUCKET).remove(uploadedPaths);
    return NextResponse.json(
      {
        error: publish
          ? `Could not publish track as live: ${lastError}`
          : `Saved file but could not create track row: ${lastError}`,
      },
      { status: 500 },
    );
  }

  const trackId = String(track.id ?? "");

  if (publish && !isPublishedTrack({ status: String(track.status ?? "") })) {
    let forced: Record<string, unknown> | null = null;
    for (const writeStatus of [liveStatus, "published"] as const) {
      const { data: updated, error: upErr } = await db
        .from("tracks")
        .update({ status: writeStatus })
        .eq("id", trackId)
        .eq("artist_id", user.id)
        .select("*")
        .maybeSingle();
      if (!upErr && updated) {
        forced = updated;
        break;
      }
      lastError = upErr?.message ?? lastError;
    }
    if (!forced || !isPublishedTrack({ status: String(forced.status ?? "") })) {
      await db.from("tracks").delete().eq("id", trackId).eq("artist_id", user.id);
      await db.storage.from(TRACKS_BUCKET).remove(uploadedPaths);
      return NextResponse.json(
        {
          error: `Publish requires status=live (got ${String(track.status)}). ${lastError || ""}`.trim(),
          code: "not_live",
        },
        { status: 500 },
      );
    }
    track = forced;
  }

  if (writers && trackId) {
    const { error: splitErr } = await supabase.rpc("set_track_writer_splits", {
      p_track_id: trackId,
      p_writers: writers.map((w) => ({
        name: w.name,
        percent: w.percent,
      })),
    });
    if (splitErr) {
      // Hard-fail: do not claim a successful publish without splits.
      await db.from("tracks").delete().eq("id", trackId).eq("artist_id", user.id);
      await db.storage.from(TRACKS_BUCKET).remove(uploadedPaths);
      const missing = /set_track_writer_splits|Could not find the function|PGRST202|relation .* does not exist|PGRST205/i.test(
        splitErr.message,
      );
      return NextResponse.json(
        {
          error: missing
            ? "Run 20260810_phase1_track_live_status.sql in Supabase SQL Editor (writer splits)."
            : `Writer splits failed: ${splitErr.message}`,
          code: missing ? "missing_migration" : "writers_failed",
        },
        { status: missing ? 503 : 500 },
      );
    }
  }

  if (publish && !isPublishedTrack({ status: String(track.status ?? "") })) {
    return NextResponse.json(
      { error: "Track saved but is not live.", code: "not_live", track },
      { status: 500 },
    );
  }

  if (!publish && isPublishedTrack({ status: String(track.status ?? "") })) {
    return NextResponse.json(
      {
        error: "Expected a draft, but the track is live.",
        code: "not_draft",
        track,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    track,
    audio_url,
    cover_art_url,
    published: publish,
    writers_saved: Boolean(writers),
    storage_mode: usingAdmin ? "service_role" : "user_rls",
  });
}
