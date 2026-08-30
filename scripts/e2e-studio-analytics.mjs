/**
 * Studio Analytics E2E — upload → 5 fan plays → analytics reflects streams + revenue.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3000 node --env-file=.env.local scripts/e2e-studio-analytics.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

function usableKey(k) {
  return Boolean(k) && k.length > 40 && !/SENSITI|REDACTED|your[_-]?key|placeholder/i.test(k);
}

if (!url || !usableKey(anon)) {
  console.error("FAIL: need Supabase URL + anon key");
  process.exit(1);
}

const stamp = Date.now();
const artistEmail = `analytics.e2e.${stamp}@rectsound.test`;
const fanEmail = `fan.analytics.${stamp}@rectsound.test`;
const password = `RectAnalytics!${stamp}`;
const title = `Analytics E2E ${stamp}`;

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

function buildPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

async function signUpArtist(client) {
  const signed = await client.auth.signUp({
    email: artistEmail,
    password,
    options: {
      data: {
        display_name: "Analytics E2E Artist",
        role: "artist",
        account_type: "artist",
      },
    },
  });
  if (signed.error || !signed.data.user) {
    throw new Error(`artist signUp: ${signed.error?.message}`);
  }
  const artistId = signed.data.user.id;
  await client.from("users").upsert({
    id: artistId,
    display_name: "Analytics E2E Artist",
    role: "artist",
    account_type: "artist",
    email: artistEmail,
    countries: ["Senegal"],
    genres: ["Afrobeats"],
    city: "Dakar",
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  });
  return artistId;
}

async function signUpFan(client) {
  const signed = await client.auth.signUp({
    email: fanEmail,
    password,
    options: {
      data: { display_name: "Analytics Fan", role: "fan", account_type: "fan" },
    },
  });
  if (signed.error || !signed.data.user) {
    throw new Error(`fan signUp: ${signed.error?.message}`);
  }
  const fanId = signed.data.user.id;
  await client.from("users").upsert({
    id: fanId,
    display_name: "Analytics Fan",
    role: "fan",
    account_type: "fan",
    email: fanEmail,
    countries: ["Senegal"],
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  });
  return fanId;
}

async function main() {
  const artistClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const fanClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("1. Create artist + fan…");
  const artistId = await signUpArtist(artistClient);
  await signUpFan(fanClient);

  const artistLogin = await artistClient.auth.signInWithPassword({
    email: artistEmail,
    password,
  });
  if (artistLogin.error || !artistLogin.data.session) {
    throw new Error(`artist login: ${artistLogin.error?.message}`);
  }
  const artistToken = artistLogin.data.session.access_token;

  console.log("2. Upload track…");
  const wav = buildWav();
  const png = buildPng();
  const fd = new FormData();
  fd.set("title", title);
  fd.set("genre", "Afrobeats");
  fd.set("language", "Wolof");
  fd.set("publish", "1");
  fd.set("duration_secs", "60");
  fd.set("writers", JSON.stringify([{ name: "Analytics E2E", percent: 100 }]));
  fd.set("audio", new Blob([wav], { type: "audio/wav" }), `e2e-${stamp}.wav`);
  fd.set("cover", new Blob([png], { type: "image/png" }), `cover-${stamp}.png`);

  const uploadRes = await fetch(`${baseUrl}/api/tracks/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${artistToken}` },
    body: fd,
  });
  const uploadBody = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) throw new Error(uploadBody.error || `upload ${uploadRes.status}`);
  const trackId = uploadBody.track?.id;
  if (!trackId) throw new Error("no track id");
  console.log("   track", trackId);

  const fanLogin = await fanClient.auth.signInWithPassword({
    email: fanEmail,
    password,
  });
  if (fanLogin.error || !fanLogin.data.session) {
    throw new Error(`fan login: ${fanLogin.error?.message}`);
  }
  const fanToken = fanLogin.data.session.access_token;

  console.log("3. Stream 5 times from fan…");
  for (let i = 0; i < 5; i++) {
    const playRes = await fetch(`${baseUrl}/api/plays`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${fanToken}`,
      },
      body: JSON.stringify({ track_id: trackId }),
    });
    const playBody = await playRes.json().catch(() => ({}));
    if (!playRes.ok) {
      throw new Error(playBody.error || `play ${i + 1} failed ${playRes.status}`);
    }
    if (playBody.earnings_error && i === 0) {
      console.log(`   earnings note: ${playBody.earnings_error}`);
    }
    console.log(`   play ${i + 1}`, playBody.play_id ? "ok" : playBody.own_play ? "own" : "?");
  }

  console.log("4. Verify play count in DB…");
  const countRes = await artistClient
    .from("plays")
    .select("id", { count: "exact", head: true })
    .eq("track_id", trackId)
    .neq("listener_id", artistId);
  const playCount = countRes.count ?? 0;
  console.log("   plays (excl artist)", playCount);
  if (playCount < 5) {
    throw new Error(`expected >= 5 plays, got ${playCount}`);
  }

  console.log("5. Fetch studio analytics API…");
  const analyticsRes = await fetch(
    `${baseUrl}/api/studio/analytics?range=all`,
    { headers: { Authorization: `Bearer ${artistToken}` } },
  );
  const analytics = await analyticsRes.json().catch(() => ({}));
  if (!analyticsRes.ok) {
    throw new Error(analytics.error || `analytics ${analyticsRes.status}`);
  }

  const song = (analytics.songs ?? []).find((s) => s.trackId === trackId);
  console.log("   analytics total streams", analytics.overview?.totalStreamsAllTime);
  console.log("   song streams", song?.totalStreams);
  console.log("   revenue XOF", analytics.revenue?.streamsXof);
  console.log("   chart positions", (analytics.chartPositions ?? []).length);

  if (!song || song.totalStreams < 5) {
    throw new Error(
      `analytics song streams expected >= 5, got ${song?.totalStreams ?? 0}`,
    );
  }

  if ((analytics.overview?.totalStreamsAllTime ?? 0) < 5) {
    throw new Error("overview total streams < 5");
  }

  if ((analytics.revenue?.streamsXof ?? 0) < 50) {
    if (analytics.revenue?.earningsReady) {
      throw new Error(
        `expected revenue >= 50 XOF with earnings table, got ${analytics.revenue?.streamsXof ?? 0}`,
      );
    }
    console.warn(
      "   WARN: revenue is 0 — apply 20260830_artist_play_earnings_bootstrap.sql",
    );
  } else {
    console.log("   revenue verified", analytics.revenue?.streamsXof, "XOF");
  }

  if ((analytics.chartPositions ?? []).length < 1) {
    console.warn("   WARN: no chart positions yet (track may need more plays)");
  } else {
    console.log("   chart positions verified", analytics.chartPositions.length);
  }

  console.log("\nPASS: Studio analytics E2E");
  console.log(`   studio: ${baseUrl}/studio/analytics`);
}

main().catch((e) => {
  console.error("\nFAIL:", e.message || e);
  process.exit(1);
});
