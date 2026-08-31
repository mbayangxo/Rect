import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { profileFromMetadata, upsertUserProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { setRectOsCookie } from "@/lib/studio/surface";

export async function POST(request: Request) {
  let body: {
    email?: string;
    password?: string;
    surface?: string;
  };
  try {
    body = (await request.json()) as {
      email?: string;
      password?: string;
      surface?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const surface = body.surface === "artist" ? "artist" : "sound";
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

  const { data: row } = await supabase
    .from("users")
    .select("role, account_type")
    .eq("id", user.id)
    .maybeSingle();

  const artist = isArtistAccount(
    row
      ? { role: row.role, account_type: row.account_type }
      : { role: profile.role, account_type: profile.account_type },
    user,
  );

  if (surface === "artist" && !artist) {
    await supabase.auth.signOut();
    return NextResponse.json(
      {
        error:
          "This is Artist OS. That login is a RECT SOUND listener account. Create an artist account, or connect it from your listener Profile.",
      },
      { status: 403 },
    );
  }

  const res = NextResponse.json({
    ok: true,
    user_id: user.id,
    email: user.email,
    surface,
    is_artist: artist,
  });
  setRectOsCookie(res, surface);
  return res;
}
