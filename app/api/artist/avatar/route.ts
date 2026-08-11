import { NextResponse } from "next/server";
import {
  deleteUserAvatar,
  uploadUserAvatar,
} from "@/lib/dashboard/avatar";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Alias of /api/account/avatar for artist studio. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  const file = form.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Avatar image is required." },
      { status: 400 },
    );
  }

  const result = await uploadUserAvatar(supabase, user.id, file);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({ ok: true, avatar_url: result.avatar_url });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const result = await deleteUserAvatar(supabase, user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({ ok: true, avatar_url: null });
}
