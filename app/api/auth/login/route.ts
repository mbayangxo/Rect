import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { profileFromMetadata, upsertUserProfile } from "@/lib/profile";

/**
 * POST /api/auth/login
 * - Default: sign in with email/password and set cookies (API/clients).
 * - Prefer the browser client on /auth/login for cookie reliability.
 * - sync_only: if already signed in (or after browser sign-in), only upsert profile.
 */
export async function POST(request: Request) {
  let body: {
    email?: string;
    password?: string;
    sync_only?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const syncOnly = Boolean(body.sync_only);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    return NextResponse.json(
      {
        error:
          "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY on the server.",
      },
      { status: 500 },
    );
  }

  const supabase = await createClient();

  if (syncOnly) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    const profile = profileFromMetadata(
      user.user_metadata as Record<string, unknown>,
      user.email,
    );
    try {
      await upsertUserProfile(supabase, user.id, profile);
    } catch {
      /* profile sync is best-effort */
    }
    return NextResponse.json({ ok: true, user_id: user.id, synced: true });
  }

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  const user = data.user;
  if (!user) {
    return NextResponse.json({ error: "No user returned." }, { status: 500 });
  }

  const profile = profileFromMetadata(
    user.user_metadata as Record<string, unknown>,
    user.email,
  );
  try {
    await upsertUserProfile(supabase, user.id, profile);
  } catch {
    /* never block login on profile upsert */
  }

  return NextResponse.json({
    ok: true,
    user_id: user.id,
    email: user.email,
  });
}
