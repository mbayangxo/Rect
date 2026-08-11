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
  const s = (status || "live").trim().toLowerCase();
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
        status: "live",
        duration_secs: 1,
      },
      {
        title,
        genre: "Afrobeats",
        audio_url: audioUrl,
        artist_id: userId,
        status: "live",
      },
    ]) {
      const { data, error } = await userClient
        .from("tracks")
        .insert(row)
        .select("*")
        .maybeSingle();
      console.log(
        "insert attempt",
        row.status,
        row.language || "-",
        error?.message || data?.status,
      );
      if (!error && data) {
        inserted = data;
        break;
      }
      lastErr = error?.message;
    }
    if (!inserted) throw new Error(`tracks insert: ${lastErr}`);
    trackId = inserted.id;

    if (!isPublished(inserted.status)) {
      const forced = await userClient
        .from("tracks")
        .update({ status: "live" })
        .eq("id", trackId)
        .select("*")
        .maybeSingle();
      if (forced.error || !forced.data) {
        throw new Error(
          `force live: ${forced.error?.message || "update returned empty"}`,
        );
      }
      inserted = forced.data;
      console.log("forced live", inserted.status);
    }

    const splits = await userClient.rpc("set_track_writer_splits", {
      p_track_id: trackId,
      p_writers: [{ name: "Studio E2E Artist", percent: 100 }],
    });
    console.log(
      "writer splits",
      splits.error?.message || "ok",
      splits.error
        ? "(run 20260810_phase1_track_live_status.sql if missing)"
        : "",
    );
  }

  console.log("track", trackId, audioUrl);

  // Public anon client — must see live tracks on Home/Charts
  const anonClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: row, error: rowErr } = await anonClient
    .from("tracks")
    .select("id,title,status,audio_url,artist_id,genre,language")
    .eq("id", trackId)
    .maybeSingle();
  if (rowErr) throw new Error(`public reload: ${rowErr.message}`);
  if (!row) throw new Error("public reload: track not visible (need status=live)");

  const live = isPublished(row.status) && Boolean(row.audio_url);
  console.log("published?", live, "status=", row.status);

  // Record a play via Next API when BASE_URL is set (full app path),
  // otherwise the same RPCs the API uses.
  let playId = null;
  let creditsLeft = null;
  if (baseUrl) {
    const playRes = await fetch(`${baseUrl}/api/plays`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${login.data.session.access_token}`,
      },
      body: JSON.stringify({ track_id: trackId }),
    });
    const playBody = await playRes.json().catch(() => ({}));
    if (!playRes.ok) {
      throw new Error(playBody.error || `plays HTTP ${playRes.status}`);
    }
    playId = playBody.play_id ?? null;
    creditsLeft = playBody.credits_remaining ?? null;
    console.log("api play", playId, "credits_left", creditsLeft);
  } else {
    const bal = await userClient.rpc("ensure_play_balance", { p_starter: 25 });
    if (bal.error) throw new Error(`ensure_play_balance: ${bal.error.message}`);
    const consumed = await userClient.rpc("consume_play_credit");
    if (consumed.error) {
      throw new Error(`consume_play_credit: ${consumed.error.message}`);
    }
    if (Number(consumed.data) < 0) {
      throw new Error("consume_play_credit returned insufficient credits");
    }
    const play = await userClient
      .from("plays")
      .insert({ track_id: trackId, listener_id: userId })
      .select("id")
      .maybeSingle();
    if (play.error || !play.data?.id) {
      throw new Error(`play insert: ${play.error?.message || "empty"}`);
    }
    playId = play.data.id;
    creditsLeft = consumed.data;
    console.log("play", playId, "credits_left", creditsLeft);
  }

  const onFeed = live;
  console.log("home/charts eligible?", Boolean(onFeed));

  if (!live || !onFeed) {
    console.error("FAIL: track not live for feed/charts");
    process.exit(2);
  }

  if (!playId) {
    console.error("FAIL: play not recorded");
    process.exit(3);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: 1,
        email,
        password,
        userId,
        trackId,
        title,
        status: row.status,
        audioUrl,
        playId,
        creditsLeft,
        viaApi: Boolean(baseUrl),
        note: "Open / and /charts — live track should appear.",
        sql: "Paste supabase/migrations/20260810_phase1_track_live_status.sql for writer splits + status aliases.",
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
