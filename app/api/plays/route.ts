import { NextResponse } from "next/server";
import {
  consumePlayCredit,
  loadPlayCreditBalance,
} from "@/lib/dashboard/credits";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Body = { track_id?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId = body.track_id?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "track_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Sign in required to record plays.", authenticated: false },
      { status: 401 },
    );
  }

  // Confirm track exists (public read)
  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("id")
    .eq("id", trackId)
    .maybeSingle();

  if (trackError || !track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  // Ensure starter balance exists, then consume one credit
  await loadPlayCreditBalance(supabase);
  const consumed = await consumePlayCredit(supabase);
  if (!consumed.ok) {
    if (consumed.code === "insufficient") {
      return NextResponse.json(
        {
          error: consumed.error,
          code: "insufficient_credits",
          authenticated: true,
        },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: consumed.error }, { status: 500 });
  }

  const row = { track_id: trackId, listener_id: user.id };

  let { data, error } = await supabase
    .from("plays")
    .insert(row)
    .select("id")
    .maybeSingle();

  // Fallback with service role if RLS not applied yet
  if (error) {
    const admin = createAdminClient();
    if (admin) {
      const adminInsert = await admin
        .from("plays")
        .insert(row)
        .select("id")
        .maybeSingle();
      data = adminInsert.data;
      error = adminInsert.error;
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    play_id: data?.id ?? null,
    credits_remaining: consumed.skipped ? null : consumed.balance,
  });
}
