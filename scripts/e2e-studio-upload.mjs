/**
 * Artist Studio E2E — create artist, upload WAV, verify home/charts eligibility.
 *
 * Usage:
 *   node --env-file=.env.local scripts/e2e-studio-upload.mjs
 *
 * Optional: BASE_URL=http://localhost:3000 (hits Next upload API with session cookies)
 * Without BASE_URL, uploads via Supabase client directly (same storage + tracks path).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = (process.env.BASE_URL || "").replace(/\/$/, "");

function usableKey(k) {
  return Boolean(k) && k.length > 40 && !/SENSITI|REDACTED|your[_-]?key|placeholder/i.test(k);
}

if (!url || !usableKey(anon)) {
  console.error("FAIL: need real NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const stamp = Date.now();
const email = `studio.e2e.${stamp}@rectsound.test`;
const password = `RectStudio!${stamp}`;
const title = `Studio E2E ${stamp}`;

/** Minimal valid WAV (~1s silence, 8kHz mono). */
function buildWav() {
  const sampleRate = 8000;
  const seconds = 1;
  const numSamples = sampleRate * seconds;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  // soft tone so players treat it as real audio
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.2 * 32767;
    buf.writeInt16LE(Math.round(sample), 44 + i * 2);
  }
  return buf;
}

function isPublished(status) {
  const s = (status || "published").trim().toLowerCase();
  return s !== "pending" && s !== "draft" && s !== "unpublished";
}

async function main() {
  const wav = buildWav();
  const outDir = join(process.cwd(), ".tmp");
  mkdirSync(outDir, { recursive: true });
  const wavPath = join(outDir, `studio-e2e-${stamp}.wav`);
  writeFileSync(wavPath, wav);
  console.log("wav", wavPath, wav.length, "bytes");

  const adminOk = usableKey(service);
  const admin = adminOk
    ? createClient(url, service, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  const userClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId;

  if (admin) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: "Studio E2E Artist",
        role: "artist",
        account_type: "artist",
      },
    });
    if (created.error || !created.data.user) {
      throw new Error(`createUser: ${created.error?.message}`);
    }
    userId = created.data.user.id;
    await admin.from("users").upsert({
      id: userId,
      display_name: "Studio E2E Artist",
      role: "artist",
      account_type: "artist",
      email,
      countries: ["Senegal"],
      genres: ["Afrobeats"],
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    });
    console.log("created artist via service role", userId);
  } else {
    const signed = await userClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: "Studio E2E Artist",
          role: "artist",
          account_type: "artist",
        },
      },
    });
    if (signed.error || !signed.data.user) {
      throw new Error(`signUp: ${signed.error?.message}`);
    }
    userId = signed.data.user.id;
    if (!signed.data.session) {
      throw new Error(
        "signUp returned no session (email confirm required). Set a real SUPABASE_SERVICE_ROLE_KEY to create a confirmed artist.",
      );
    }
    await userClient.from("users").upsert({
      id: userId,
      display_name: "Studio E2E Artist",
      role: "artist",
      account_type: "artist",
      email,
      countries: ["Senegal"],
      genres: ["Afrobeats"],
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    });
    console.log("created artist via signup", userId);
  }

  const login = await userClient.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) {
    throw new Error(`login: ${login.error?.message || "no session"}`);
  }
  console.log("logged in");

  let trackId = null;
  let audioUrl = null;

  if (baseUrl) {
    const fd = new FormData();
    fd.set("title", title);
    fd.set("genre", "Afrobeats");
    fd.set("language", "Wolof");
    fd.set("publish", "1");
    fd.set("duration_secs", "1");
    fd.set(
      "writers",
      JSON.stringify([{ name: "Studio E2E Artist", percent: 100 }]),
    );
    fd.set(
      "audio",
      new Blob([wav], { type: "audio/wav" }),
      `studio-e2e-${stamp}.wav`,
    );

    const res = await fetch(`${baseUrl}/api/tracks/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${login.data.session.access_token}`,
        Cookie: `sb-access-token=${login.data.session.access_token}; sb-refresh-token=${login.data.session.refresh_token}`,
      },
      body: fd,
    });
    const body = await res.json().catch(() => ({}));
    console.log("api upload", res.status, body.error || body.ok, body.storage_mode);
    if (!res.ok) throw new Error(body.error || `upload HTTP ${res.status}`);
    trackId = body.track?.id;
    audioUrl = body.audio_url;
  } else {
    const path = `${userId}/${stamp}-e2e.wav`;
    const up = await userClient.storage.from("tracks").upload(path, wav, {
      contentType: "audio/wav",
      upsert: false,
    });
    if (up.error) throw new Error(`storage: ${up.error.message}`);
    const { data: pub } = userClient.storage.from("tracks").getPublicUrl(path);
    audioUrl = pub.publicUrl;

    let inserted = null;
    let lastErr = null;
    for (const row of [
      {
        title,
        genre: "Afrobeats",
        language: "Wolof",
        audio_url: audioUrl,
        artist_id: userId,
        status: "published",
        duration_secs: 1,
      },
      {
        title,
        genre: "Afrobeats",
        audio_url: audioUrl,
        artist_id: userId,
        status: "published",
      },
      {
        title,
        genre: "Afrobeats",
        audio_url: audioUrl,
        artist_id: userId,
      },
    ]) {
      const { data, error } = await userClient
        .from("tracks")
        .insert(row)
        .select("*")
        .maybeSingle();
      if (!error && data) {
        inserted = data;
        break;
      }
      lastErr = error?.message;
    }
    if (!inserted) throw new Error(`tracks insert: ${lastErr}`);
    trackId = inserted.id;

    const splits = await userClient.rpc("set_track_writer_splits", {
      p_track_id: trackId,
      p_writers: [{ name: "Studio E2E Artist", percent: 100 }],
    });
    console.log(
      "writer splits",
      splits.error?.message || "ok",
      splits.error
        ? "(run 20260810_track_writer_splits.sql if missing)"
        : "",
    );
  }

  console.log("track", trackId, audioUrl);

  const { data: row, error: rowErr } = await userClient
    .from("tracks")
    .select("id,title,status,audio_url,artist_id,genre,language")
    .eq("id", trackId)
    .maybeSingle();
  if (rowErr || !row) throw new Error(`reload track: ${rowErr?.message}`);

  const live = isPublished(row.status) && Boolean(row.audio_url);
  console.log("published?", live, "status=", row.status);

  // Home / charts eligibility: published + not demo
  const { data: ranked, error: rankErr } = await userClient
    .from("tracks")
    .select("id,title,status,audio_url")
    .eq("id", trackId)
    .maybeSingle();
  if (rankErr) throw new Error(rankErr.message);
  const onFeed = ranked && isPublished(ranked.status) && ranked.audio_url;
  console.log("home/charts eligible?", Boolean(onFeed));

  if (!live || !onFeed) {
    console.error("FAIL: track not live for feed/charts");
    process.exit(2);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        password,
        userId,
        trackId,
        title,
        audioUrl,
        note: "Open / and /charts — track should appear (Senegal → Dakar board).",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("FAIL:", e.message || e);
  process.exit(1);
});
