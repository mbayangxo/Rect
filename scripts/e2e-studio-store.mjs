/**
 * Studio Store E2E — artist adds merch → appears on public portal.
 *
 * Usage:
 *   node --env-file=.env.local scripts/e2e-studio-store.mjs
 *   BASE_URL=http://localhost:3000 node --env-file=.env.local scripts/e2e-studio-store.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);

function usableKey(k) {
  return Boolean(k) && k.length > 40 && !/SENSITI|REDACTED|your[_-]?key|placeholder/i.test(k);
}

if (!url || !usableKey(anon)) {
  console.error("FAIL: need NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const stamp = Date.now();
const artistEmail = `store.e2e.${stamp}@rectsound.test`;
const password = `RectStore!${stamp}`;
const merchTitle = `Store E2E Tee ${stamp}`;

function buildPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

async function createArtist(admin) {
  const created = await admin.auth.admin.createUser({
    email: artistEmail,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: "Store E2E Artist",
      role: "artist",
      account_type: "artist",
    },
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser: ${created.error?.message}`);
  }
  const userId = created.data.user.id;
  await admin.from("users").upsert({
    id: userId,
    display_name: "Store E2E Artist",
    role: "artist",
    account_type: "artist",
    email: artistEmail,
    countries: ["Senegal"],
    genres: ["Afrobeats"],
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

  const artistClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("1. Check merch table…");
  const probeClient = admin ?? artistClient;
  const probe = await probeClient.from("artist_merch_items").select("id").limit(1);
  if (
    probe.error &&
    /does not exist|PGRST205|Could not find the table|schema cache/i.test(
      probe.error.message,
    )
  ) {
    console.error(
      "FAIL: Run supabase/migrations/20260830_artist_merch_store.sql in Supabase SQL Editor first.",
    );
    process.exit(1);
  }
  console.log("   table ok");

  console.log("2. Create artist…");
  let artistId;
  if (admin) {
    artistId = await createArtist(admin);
  } else {
    const signed = await artistClient.auth.signUp({
      email: artistEmail,
      password,
      options: {
        data: {
          display_name: "Store E2E Artist",
          role: "artist",
          account_type: "artist",
        },
      },
    });
    if (signed.error || !signed.data.user) {
      throw new Error(`signUp: ${signed.error?.message}`);
    }
    artistId = signed.data.user.id;
    await artistClient.from("users").upsert({
      id: artistId,
      display_name: "Store E2E Artist",
      role: "artist",
      account_type: "artist",
      email: artistEmail,
      countries: ["Senegal"],
      genres: ["Afrobeats"],
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    });
  }

  const login = await artistClient.auth.signInWithPassword({
    email: artistEmail,
    password,
  });
  if (login.error || !login.data.session) {
    throw new Error(`login: ${login.error?.message}`);
  }
  const token = login.data.session.access_token;
  console.log("   artist", artistId);

  console.log("3. Create merch item via API…");
  const createRes = await fetch(`${baseUrl}/api/artist/merch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: merchTitle,
      description: "E2E test merch item",
      price_xof: 5000,
      category: "clothing",
      quantity_available: 10,
    }),
  });
  const createBody = await createRes.json().catch(() => ({}));
  console.log("   create", createRes.status, createBody.error || "ok");
  if (!createRes.ok || !createBody.item?.id) {
    throw new Error(createBody.error || `create failed ${createRes.status}`);
  }
  const itemId = createBody.item.id;

  console.log("4. Upload merch photo…");
  const png = buildPng();
  const form = new FormData();
  form.set("photo", new Blob([png], { type: "image/png" }), `merch-${stamp}.png`);
  const imgRes = await fetch(`${baseUrl}/api/artist/merch/${itemId}/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const imgBody = await imgRes.json().catch(() => ({}));
  console.log("   photo", imgRes.status, imgBody.error || "ok");
  if (!imgRes.ok) {
    throw new Error(imgBody.error || `photo upload ${imgRes.status}`);
  }

  console.log("5. Verify on portal (anon read)…");
  const anonClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: portalItems, error: portalErr } = await anonClient
    .from("artist_merch_items")
    .select("id, title, active, image_urls")
    .eq("artist_id", artistId)
    .eq("active", true);

  if (portalErr) throw new Error(`portal query: ${portalErr.message}`);
  const found = (portalItems ?? []).find(
    (r) => String(r.id) === String(itemId) || r.title === merchTitle,
  );
  console.log(
    "   portal items",
    portalItems?.length ?? 0,
    found ? "FOUND" : "MISSING",
  );
  if (!found) {
    throw new Error("merch item not visible on public portal query");
  }
  if (!Array.isArray(found.image_urls) || found.image_urls.length < 1) {
    throw new Error("merch photo not on portal item");
  }

  if (baseUrl) {
    console.log("6. Verify portal page HTML…");
    const pageRes = await fetch(`${baseUrl}/artists/${artistId}`);
    const html = await pageRes.text();
    if (!html.includes(merchTitle)) {
      throw new Error("merch title not in portal page HTML");
    }
    console.log("   portal page ok");
  }

  console.log("\nPASS: Store E2E — merch created and visible on portal");
  console.log(`   portal: ${baseUrl}/artists/${artistId}`);
  console.log(`   studio: ${baseUrl}/studio/store`);

  // cleanup
  await fetch(`${baseUrl}/api/artist/merch/${itemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (admin) {
    await admin.auth.admin.deleteUser(artistId);
  }
}

main().catch((e) => {
  console.error("\nFAIL:", e.message || e);
  process.exit(1);
});
