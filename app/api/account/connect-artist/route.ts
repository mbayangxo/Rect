import { createClient as createJsClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Link the signed-in RECT SOUND listener to a separate Artist OS login.
 * Verifies artist email/password without replacing the listener session.
 */
export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Artist email and password are required." },
      { status: 400 },
    );
  }

  const listenerClient = await createClient();
  const {
    data: { user: listener },
  } = await listenerClient.auth.getUser();
  if (!listener) {
    return NextResponse.json({ error: "Sign in to RECT SOUND first." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Auth is not configured." }, { status: 500 });
  }

  const probe = createJsClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json(
      { error: "Could not verify that Artist OS login." },
      { status: 401 },
    );
  }

  if (data.user.id === listener.id) {
    return NextResponse.json(
      {
        error:
          "That’s the same login. Artist OS needs its own artist account — create one at /artist, then connect it here.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const db = admin ?? listenerClient;
  const { data: artistRow, error: artistErr } = await db
    .from("users")
    .select("id, display_name, role, account_type")
    .eq("id", data.user.id)
    .maybeSingle();

  if (artistErr && /linked_artist|column .* does not exist/i.test(artistErr.message)) {
    return NextResponse.json(
      { error: "Run the artist account link SQL in Supabase, then try again." },
      { status: 503 },
    );
  }

  const artistUser = {
    ...data.user,
    user_metadata: data.user.user_metadata ?? {},
  };
  if (
    !isArtistAccount(
      artistRow
        ? { role: artistRow.role, account_type: artistRow.account_type }
        : null,
      artistUser,
    )
  ) {
    return NextResponse.json(
      { error: "That login is not an Artist OS account." },
      { status: 403 },
    );
  }

  const writer = admin ?? listenerClient;
  const { error: linkErr } = await writer
    .from("users")
    .update({
      linked_artist_id: data.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listener.id);

  if (linkErr) {
    return NextResponse.json(
      {
        error: /column .* does not exist/i.test(linkErr.message)
          ? "Run the artist account link SQL in Supabase, then try again."
          : linkErr.message,
      },
      { status: 500 },
    );
  }

  await writer
    .from("users")
    .update({
      linked_listener_id: listener.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.user.id);

  return NextResponse.json({
    ok: true,
    linked_artist_id: data.user.id,
    artist_name:
      (typeof artistRow?.display_name === "string" && artistRow.display_name) ||
      data.user.email,
  });
}
