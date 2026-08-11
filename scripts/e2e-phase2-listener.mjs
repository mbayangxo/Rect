/**
 * Phase 2 listener loop E2E — public catalog, search filter, follow, play.
 *
 * Usage:
 *   node --env-file=.env.local scripts/e2e-phase2-listener.mjs
 *
 * Optional:
 *   TRACK_ID=... ARTIST_ID=...  (reuse a live track; otherwise creates one)
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function usable(k) {
  return Boolean(k) && k.length >= 20 && !/SENSITI|REDACTED|your[_-]?key|placeholder/i.test(k);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function buildWav() {
  const sampleRate = 8000;
  const n = sampleRate;
  const dataSize = n * 2;
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
  for (let i = 0; i < n; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2 * 32767;
    buf.writeInt16LE(Math.round(sample), 44 + i * 2);
  }
  return buf;
}

async function ensureLiveTrack(sb) {
  if (process.env.TRACK_ID && process.env.ARTIST_ID) {
    return {
      trackId: process.env.TRACK_ID,
      artistId: process.env.ARTIST_ID,
      title: "(reuse)",
    };
  }

  const stamp = Date.now();
  const email = `p2.artist.${stamp}@rectsound.test`;
  const password = `RectP2!${stamp}`;
  const title = `Phase2 Live ${stamp}`;

  const up = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: "artist",
        account_type: "artist",
        display_name: "Phase2 Artist",
      },
    },
  });
  assert(up.data.session && up.data.user, up.error?.message || "artist signup failed");
  const artistId = up.data.user.id;

  await sb.from("users").upsert({
    id: artistId,
    display_name: "Phase2 Artist",
    role: "artist",
    account_type: "artist",
    email,
    countries: ["Senegal"],
    genres: ["Afrobeats"],
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  });

  const wav = buildWav();
  const outDir = join(process.cwd(), ".tmp");
  mkdirSync(outDir, { recursive: true });
  const wavPath = join(outDir, `phase2-${stamp}.wav`);
  writeFileSync(wavPath, wav);

  const path = `${artistId}/${stamp}-p2.wav`;
  const stor = await sb.storage.from("tracks").upload(path, wav, {
    contentType: "audio/wav",
  });
  assert(!stor.error, `storage: ${stor.error?.message}`);
  const audio_url = sb.storage.from("tracks").getPublicUrl(path).data.publicUrl;

  const ins = await sb
    .from("tracks")
    .insert({
      title,
      genre: "Afrobeats",
      language: "Wolof",
      audio_url,
      artist_id: artistId,
      status: "live",
      duration_secs: 1,
    })
    .select("id,status")
    .maybeSingle();
  assert(!ins.error && ins.data?.id, `track insert: ${ins.error?.message}`);
  assert(ins.data.status === "live", `expected live, got ${ins.data.status}`);

  const splits = await sb.rpc("set_track_writer_splits", {
    p_track_id: ins.data.id,
    p_writers: [{ name: "Phase2 Artist", percent: 100 }],
  });
  console.log("writer splits", splits.error?.message || "ok");

  return { trackId: ins.data.id, artistId, title, email, password, wavPath };
}

async function main() {
  assert(usable(url) && usable(anon), "Need real NEXT_PUBLIC_SUPABASE_URL + ANON_KEY");

  const artistSb = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const created = await ensureLiveTrack(artistSb);
  const { trackId, artistId, title } = created;
  console.log("track", trackId, title);

  // Public visibility (Home / Charts eligibility)
  const publicSb = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const live = await publicSb
    .from("tracks")
    .select("id,title,status,audio_url")
    .eq("id", trackId)
    .maybeSingle();
  assert(!live.error && live.data, `public miss: ${live.error?.message || "empty"}`);
  assert(
    ["live", "published"].includes((live.data.status || "").toLowerCase()) ||
      live.data.status == null,
    `not live: ${live.data.status}`,
  );
  const head = await fetch(live.data.audio_url, { method: "HEAD" });
  assert(head.ok, `audio HTTP ${head.status}`);
  console.log("OK public + audio");

  // Search filter (live catalog)
  const found = await publicSb
    .from("tracks")
    .select("id")
    .or("status.eq.live,status.eq.published,status.is.null")
    .not("audio_url", "is", null)
    .ilike("title", `%${title.includes("reuse") ? "" : title.slice(0, 20)}%`)
    .limit(20);
  if (!title.includes("reuse")) {
    assert(
      (found.data || []).some((t) => t.id === trackId),
      "search filter missed track",
    );
  }
  console.log("OK search/live filter");

  // Listener follow + play
  const stamp = Date.now();
  const fan = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const fanEmail = `p2.fan.${stamp}@rectsound.test`;
  const fanPass = `RectFan!${stamp}`;
  const fanUp = await fan.auth.signUp({
    email: fanEmail,
    password: fanPass,
    options: {
      data: {
        role: "listener",
        account_type: "listener",
        display_name: "Phase2 Fan",
      },
    },
  });
  assert(fanUp.data.session && fanUp.data.user, fanUp.error?.message || "fan signup");
  await fan.from("users").upsert({
    id: fanUp.data.user.id,
    display_name: "Phase2 Fan",
    role: "listener",
    account_type: "listener",
    email: fanEmail,
    onboarding_completed: true,
  });

  // Prefer RPC (same path as /api/follows)
  const rpc = await fan.rpc("toggle_artist_follow", { p_artist_id: artistId });
  if (rpc.error) {
    throw new Error(
      `toggle_artist_follow RPC failed (no insert fallback): ${rpc.error.message}`,
    );
  }
  assert(rpc.data?.following === true, `expected following true, got ${JSON.stringify(rpc.data)}`);

  const row = await fan
    .from("artist_follows")
    .select("follower_id, artist_id")
    .eq("follower_id", fanUp.data.user.id)
    .eq("artist_id", artistId)
    .maybeSingle();
  assert(row.data, `follow row missing: ${row.error?.message || "empty"}`);
  console.log("OK follow");

  const feed = await fan
    .from("tracks")
    .select("id,title")
    .eq("artist_id", artistId)
    .or("status.eq.live,status.eq.published,status.is.null")
    .not("audio_url", "is", null)
    .limit(10);
  assert(
    (feed.data || []).some((t) => t.id === trackId),
    "following feed missing live track",
  );
  console.log("OK following feed");

  const bal = await fan.rpc("ensure_play_balance", { p_starter: 25 });
  assert(!bal.error, `ensure_play_balance: ${bal.error?.message}`);
  const consumed = await fan.rpc("consume_play_credit");
  assert(!consumed.error, `consume_play_credit: ${consumed.error?.message}`);
  assert(Number(consumed.data) >= 0, "insufficient credits after consume");

  const play = await fan
    .from("plays")
    .insert({ track_id: trackId, listener_id: fanUp.data.user.id })
    .select("id")
    .maybeSingle();
  assert(!play.error && play.data?.id, `play: ${play.error?.message}`);
  console.log("OK listener play", play.data.id, "credits_left", consumed.data);

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: "2-listener-loop",
        trackId,
        artistId,
        title,
        fanEmail,
        checks: [
          "public live visibility",
          "audio HTTP 200",
          "search/live filter",
          "artist follow",
          "following feed",
          "listener play",
        ],
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
