import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearRectOsCookie } from "@/lib/studio/surface";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const res = NextResponse.json({ ok: true });
  clearRectOsCookie(res);
  return res;
}
