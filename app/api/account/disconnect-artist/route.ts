import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { data: row } = await supabase
    .from("users")
    .select("linked_artist_id")
    .eq("id", user.id)
    .maybeSingle();

  const artistId =
    typeof row?.linked_artist_id === "string" ? row.linked_artist_id : null;

  const writer = createAdminClient() ?? supabase;
  await writer
    .from("users")
    .update({ linked_artist_id: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (artistId) {
    await writer
      .from("users")
      .update({ linked_listener_id: null, updated_at: new Date().toISOString() })
      .eq("id", artistId);
  }

  return NextResponse.json({ ok: true });
}
