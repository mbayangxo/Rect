import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  profileFromMetadata,
  upsertUserProfile,
  type RectRole,
} from "@/lib/profile";

type Body = {
  email?: string;
  password?: string;
  display_name?: string;
  role?: RectRole;
  phone?: string | null;
  countries?: string[];
  genres?: string[];
  languages?: string[];
  listening_times?: string[];
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanList(value: unknown, max = 40): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t || out.includes(t)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const display_name = body.display_name?.trim() ?? "";
  const role: RectRole = body.role === "artist" ? "artist" : "fan";
  const phone = body.phone?.trim() || null;
  const countries = cleanList(body.countries);
  const genres = cleanList(body.genres);
  const languages = cleanList(body.languages);
  const listening_times = cleanList(body.listening_times, 8);

  if (countries.length < 1) {
    return NextResponse.json(
      { error: "Select at least one place you're from." },
      { status: 400 },
    );
  }
  if (genres.length < 1) {
    return NextResponse.json(
      { error: "Select at least one genre that moves you." },
      { status: 400 },
    );
  }
  if (languages.length < 1) {
    return NextResponse.json(
      { error: "Select at least one language." },
      { status: 400 },
    );
  }
  if (listening_times.length < 1) {
    return NextResponse.json(
      { error: "Select at least one listening time." },
      { status: 400 },
    );
  }
  if (display_name.length < 2 || display_name.length > 24) {
    return NextResponse.json(
      { error: "Display name must be 2–24 characters." },
      { status: 400 },
    );
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const metadata = {
    display_name,
    role,
    account_type: role,
    phone,
    countries,
    genres,
    languages,
    listening_times,
    onboarding_completed: true,
  };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const user = data.user;
  if (!user) {
    return NextResponse.json(
      { error: "Signup succeeded but no user was returned." },
      { status: 500 },
    );
  }

  let session = data.session;
  let emailConfirmationRequired = !session;
  const admin = createAdminClient();

  if (!session && admin) {
    const { error: confirmError } = await admin.auth.admin.updateUserById(
      user.id,
      { email_confirm: true, user_metadata: metadata },
    );
    if (!confirmError) {
      const { data: signedIn, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (!signInError && signedIn.session) {
        session = signedIn.session;
        emailConfirmationRequired = false;
      }
    }
  }

  const profile = profileFromMetadata(metadata, email);
  let profile_save: { ok: boolean; mode?: string; error?: string } | null =
    null;

  const writer = session ? supabase : admin;
  if (writer) {
    const result = await upsertUserProfile(writer, user.id, profile);
    profile_save = result.ok
      ? { ok: true, mode: result.mode }
      : { ok: false, error: result.error };
  }

  return NextResponse.json({
    ok: true,
    user_id: user.id,
    email,
    display_name,
    role,
    account_type: role,
    countries,
    genres,
    languages,
    listening_times,
    has_session: !!session,
    email_confirmation_required: emailConfirmationRequired,
    profile_save,
  });
}
