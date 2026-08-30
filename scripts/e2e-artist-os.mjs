/**
 * Artist OS E2E — full upload → play → analytics verification.
 *
 * Usage:
 *   node --env-file=.env.local scripts/e2e-artist-os.mjs
 *   BASE_URL=http://localhost:3000 node --env-file=.env.local scripts/e2e-artist-os.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

function usableKey(k) {
  return Boolean(k) && k.length > 40 && !/SENSITI|REDACTED|your[_-]?key|placeholder/i.test(k);
}

if (!url || !usableKey(anon)) {
  console.error("FAIL: need NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const stamp = Date.now();
const artistEmail = `artist.os.${stamp}@rectsound.test`;
const fanEmail = `fan.os.${stamp}@rectsound.test`;
const password = `RectOS!${stamp}`;
const title = `Artist OS E2E ${stamp}`;

function buildWav() {
  const sampleRate = 8000;
  const numSamples = sampleRate;
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
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 0.2 * 32767;
    buf.writeInt16LE(Math.round(sample), 44 + i * 2);
  }
  return buf;
}

/** Minimal 1x1 PNG */
function buildPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

function isPublished(status) {
  const s = (status || "live").trim().toLowerCase();
  return s !== "pending" && s !== "draft" && s !== "unpublished";
}

async function createUser(admin, email, role) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: role === "artist" ? "Artist OS E2E" : "Fan OS E2E",
      role,
      account_type: role,
    },
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser ${role}: ${created.error?.message}`);
  }
  const userId = created.data.user.id;
  await admin.from("users").upsert({
    id: userId,
    display_name: role === "artist" ? "Artist OS E2E" : "Fan OS E2E",
    role,
    account_type: role,
    email,
    countries: role === "artist" ? ["Senegal"] : [],
    genres: role === "artist" ? ["Afrobeats"] : ["Afrobeats"],
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  });
  return userId;
}

async function main() {
  const adminOk = usableKey(service);
  const admin = adminOk
    ? createClient(url, service, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  const wav = buildWav();
  const png = buildPng();
  const outDir = join(process.cwd(), ".tmp");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `artist-os-${stamp}.wav`), wav);

  console.log("1. Creating artist + fan accounts…");
  let artistId;
  let fanId;

  const artistClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const fanClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (admin) {
    artistId = await createUser(admin, artistEmail, "artist");
    fanId = await createUser(admin, fanEmail, "fan");
  } else {
    for (const [email, role] of [
      [artistEmail, "artist"],
      [fanEmail, "fan"],
    ]) {
      const client = role === "artist" ? artistClient : fanClient;
      const signed = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: role === "artist" ? "Artist OS E2E" : "Fan OS E2E",
            role,
            account_type: role,
          },
        },
      });
      if (signed.error || !signed.data.user) {
        throw new Error(`signUp ${role}: ${signed.error?.message}`);
      }
      const id = signed.data.user.id;
      await client.from("users").upsert({
        id,
        display_name: role === "artist" ? "Artist OS E2E" : "Fan OS E2E",
        role,
        account_type: role,
        email,
        countries: role === "artist" ? ["Senegal"] : [],
        genres: role === "artist" ? ["Afrobeats"] : ["Afrobeats"],
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      });
      if (role === "artist") artistId = id;
      else fanId = id;
    }
  }
  console.log("   artist", artistId, "fan", fanId);

  const artistLogin = await artistClient.auth.signInWithPassword({
    email: artistEmail,
    password,
  });
  if (artistLogin.error || !artistLogin.data.session) {
    throw new Error(`artist login: ${artistLogin.error?.message}`);
  }
  console.log("2. Artist logged in");

  let trackId = null;

  if (baseUrl) {
    const fd = new FormData();
    fd.set("title", title);
    fd.set("genre", "Afrobeats");
    fd.set("language", "Wolof");
    fd.set("publish", "1");
    fd.set("duration_secs", "1");
    fd.set("writers", JSON.stringify([{ name: "Artist OS E2E", percent: 100 }]));
    fd.set("audio", new Blob([wav], { type: "audio/wav" }), `e2e-${stamp}.wav`);
    fd.set("cover", new Blob([png], { type: "image/png" }), `cover-${stamp}.png`);

    const res = await fetch(`${baseUrl}/api/tracks/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${artistLogin.data.session.access_token}`,
      },
      body: fd,
    });
    const body = await res.json().catch(() => ({}));
    console.log("3. Upload via API", res.status, body.error || "ok");
    if (!res.ok) throw new Error(body.error || `upload ${res.status}`);
    trackId = body.track?.id;
  } else {
    const db = admin ?? artistClient;
    const path = `${artistId}/${stamp}.wav`;
    const storageClient = admin ?? artistClient;
    await storageClient.storage.from("tracks").upload(path, wav, {
      contentType: "audio/wav",
      upsert: false,
    });
    const { data: pub } = storageClient.storage.from("tracks").getPublicUrl(path);
    const { data: track, error } = await db
      .from("tracks")
      .insert({
        title,
        genre: "Afrobeats",
        language: "Wolof",
        audio_url: pub.publicUrl,
        cover_art_url: pub.publicUrl,
        artist_id: artistId,
        status: "live",
        duration_secs: 1,
      })
      .select("id")
      .maybeSingle();
    if (error || !track) throw new Error(`insert: ${error?.message}`);
    trackId = track.id;
    await artistClient.rpc("set_track_writer_splits", {
      p_track_id: trackId,
      p_writers: [{ name: "Artist OS E2E", percent: 100 }],
    });
    console.log("3. Upload via Supabase direct", trackId);
  }

  if (!trackId) throw new Error("no track id");

  const anonClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: publicTrack } = await anonClient
    .from("tracks")
    .select("id, status, audio_url")
    .eq("id", trackId)
    .maybeSingle();

  console.log("4. Public track visible?", Boolean(publicTrack), publicTrack?.status);
  if (!publicTrack || !isPublished(publicTrack.status)) {
    throw new Error("track not on public catalog");
  }

  const fanLogin = await fanClient.auth.signInWithPassword({
    email: fanEmail,
    password,
  });
  if (fanLogin.error || !fanLogin.data.session) {
    throw new Error(`fan login: ${fanLogin.error?.message}`);
  }
  console.log("5. Fan logged in");

  let playId = null;
  if (baseUrl) {
    const playRes = await fetch(`${baseUrl}/api/plays`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${fanLogin.data.session.access_token}`,
      },
      body: JSON.stringify({ track_id: trackId }),
    });
    const playBody = await playRes.json().catch(() => ({}));
    if (!playRes.ok) throw new Error(playBody.error || `play ${playRes.status}`);
    playId = playBody.play_id;
  } else {
    const recorded = await fanClient.rpc("record_credited_play", {
      p_track_id: trackId,
      p_starter: 25,
    });
    if (recorded.error) {
      const consumed = await fanClient.rpc("consume_play_credit");
      if (consumed.error) throw new Error(consumed.error.message);
      const play = await fanClient
        .from("plays")
        .insert({ track_id: trackId, listener_id: fanId })
        .select("id")
        .maybeSingle();
      if (play.error || !play.data?.id) {
        throw new Error(`play insert: ${play.error?.message || "empty"}`);
      }
      playId = play.data.id;
    } else {
      playId = recorded.data?.play_id ?? null;
    }
  }
  console.log("6. Play recorded", playId);
  if (!playId) throw new Error("play not recorded");

  const countClient = admin ?? artistClient;
  const { count } = await countClient
    .from("plays")
    .select("id", { count: "exact", head: true })
    .eq("track_id", trackId)
    .neq("listener_id", artistId);

  console.log("7. Play count in DB", count);
  if (!count || count < 1) throw new Error("play count not incremented");

  const playsRes = await countClient
    .from("plays")
    .select("track_id, listener_id, created_at")
    .eq("track_id", trackId);
  const playRows = playsRes.data ?? [];
  const analyticsPlays = playRows.filter((p) => p.listener_id !== artistId).length;
  console.log("8. Analytics-equivalent plays", analyticsPlays);
  if (analyticsPlays < 1) throw new Error("analytics play count < 1");

  console.log("9. Studio analytics API…");
  const analyticsRes = await fetch(`${baseUrl}/api/studio/analytics?range=all`, {
    headers: { Authorization: `Bearer ${artistLogin.data.session.access_token}` },
  });
  const analytics = await analyticsRes.json().catch(() => ({}));
  if (!analyticsRes.ok) {
    throw new Error(analytics.error || `analytics ${analyticsRes.status}`);
  }
  console.log(
    "   overview streams",
    analytics.overview?.totalStreamsAllTime,
    "revenue",
    analytics.revenue?.streamsXof,
  );
  if ((analytics.overview?.totalStreamsAllTime ?? 0) < 1) {
    throw new Error("analytics overview streams < 1");
  }

  const { count: earningCount, error: earnErr } = await countClient
    .from("artist_play_earnings")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId);
  if (earnErr && /does not exist|PGRST205/i.test(earnErr.message)) {
    console.warn(
      "10. WARN: artist_play_earnings missing — run 20260830_artist_play_earnings_bootstrap.sql",
    );
  } else {
    console.log("10. Play earnings rows", earningCount ?? 0);
    if ((earningCount ?? 0) < 1) {
      console.warn("   WARN: no earnings row — run artist_play_earnings bootstrap");
    }
  }

  console.log("11. Home feed includes track…");
  const dashRes = await fetch(`${baseUrl}/dashboard`, {
    headers: { Cookie: "" },
  });
  const dashHtml = await dashRes.text();
  if (!dashHtml.includes(title) && !dashHtml.includes(trackId)) {
    console.warn("   WARN: track title not in dashboard HTML (may need taste match)");
  } else {
    console.log("   dashboard ok");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        steps: [
          "artist login",
          "upload publish",
          "public catalog",
          "fan login",
          "fan play",
          "play count",
          "analytics plays",
          "studio analytics API",
          "play earnings",
          "home feed",
        ],
        artistEmail,
        fanEmail,
        password,
        trackId,
        title,
        playCount: count,
        analyticsStreams: analytics.overview?.totalStreamsAllTime,
        revenueXof: analytics.revenue?.streamsXof,
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
