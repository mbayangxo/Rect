import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // No cookie / logged out is normal — not a server failure.
  if (error?.message?.toLowerCase().includes("session") || !user) {
    return NextResponse.json(
      { authenticated: false, reason: error?.message ?? "no_session" },
      { status: 401 },
    );
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      metadata: user.user_metadata,
    },
    profile,
    profile_error: profileError?.message ?? null,
  });
}
