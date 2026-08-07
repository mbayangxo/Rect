import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { profileFromMetadata, upsertUserProfile } from "@/lib/profile";

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
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
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
  await upsertUserProfile(supabase, user.id, profile);

  return NextResponse.json({
    ok: true,
    user_id: user.id,
    email: user.email,
  });
}
