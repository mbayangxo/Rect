import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Body = { duration_secs?: number };

/**
 * Fill duration_secs once when missing — any signed-in listener can report
 * duration learned from playback metadata (catalog hygiene).
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const trackId = id?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "Track id required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const raw = body.duration_secs;
  if (
    typeof raw !== "number" ||
    !Number.isFinite(raw) ||
    raw < 1 ||
    raw > 7200
  ) {
    return NextResponse.json(
      { error: "duration_secs must be 1–7200." },
      { status: 400 },
    );
  }
  const duration_secs = Math.round(raw);

  const admin = createAdminClient();
  const db = admin ?? supabase;

  const { data: existing, error: findError } = await db
    .from("tracks")
    .select("id, duration_secs")
    .eq("id", trackId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }

  const current = Number(existing.duration_secs);
  if (Number.isFinite(current) && current > 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      duration_secs: current,
    });
  }

  const { data, error } = await db
    .from("tracks")
    .update({ duration_secs })
    .eq("id", trackId)
    .select("id, duration_secs")
    .maybeSingle();

  if (error) {
    // Column may be missing — soft fail
    if (/duration_secs|column .* does not exist/i.test(error.message)) {
      return NextResponse.json({
        ok: false,
        skipped: true,
        error: error.message,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    skipped: false,
    track: data,
  });
}
