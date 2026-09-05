import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

/**
 * Search artists by display name for RECT Label invites (not UUID-only).
 */
export async function GET(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ artists: [] });
  }

  const safe = q.replace(/[%_,]/g, " ").slice(0, 64);

  let { data, error } = await supabase
    .from("users")
    .select("id, display_name, account_type, role, avatar_url")
    .ilike("display_name", `%${safe}%`)
    .or("account_type.eq.artist,role.eq.artist")
    .neq("id", current.user.id)
    .limit(12);

  if (error && /account_type|avatar_url|column .* does not exist/i.test(error.message)) {
    const lean = await supabase
      .from("users")
      .select("id, display_name, role")
      .ilike("display_name", `%${safe}%`)
      .eq("role", "artist")
      .neq("id", current.user.id)
      .limit(12);
    data = lean.data as typeof data;
    error = lean.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const artists = (data ?? [])
    .map((row) => ({
      id: String(row.id),
      display_name:
        (typeof row.display_name === "string" && row.display_name.trim()) ||
        "Artist",
      avatar_url:
        typeof (row as { avatar_url?: unknown }).avatar_url === "string"
          ? ((row as { avatar_url: string }).avatar_url as string)
          : null,
    }))
    .filter((a) => a.id);

  return NextResponse.json({ artists });
}
