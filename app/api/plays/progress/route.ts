import { NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

type Body = { play_id?: string; listened_secs?: number };

/**
 * Update listened_secs on an owned play — feeds completion analytics + behavior affinity.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const playId = body.play_id?.trim();
  const secs = Math.round(Number(body.listened_secs));
  if (!playId) {
    return NextResponse.json({ error: "play_id is required" }, { status: 400 });
  }
  if (!Number.isFinite(secs) || secs < 0) {
    return NextResponse.json(
      { error: "listened_secs must be a non-negative number" },
      { status: 400 },
    );
  }

  const supabase = await createRouteClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Sign in required.", authenticated: false },
      { status: 401 },
    );
  }

  const { data, error } = await supabase.rpc("update_play_listened_secs", {
    p_play_id: playId,
    p_listened_secs: Math.min(secs, 86400),
  });

  if (error) {
    if (
      /update_play_listened_secs|function .* does not exist|PGRST202/i.test(
        error.message,
      )
    ) {
      // Fallback direct update if RPC missing but policy exists
      const { data: row, error: upErr } = await supabase
        .from("plays")
        .update({ listened_secs: Math.min(secs, 86400) })
        .eq("id", playId)
        .eq("listener_id", user.id)
        .select("id, listened_secs")
        .maybeSingle();
      if (upErr) {
        if (/listened_secs|column .* does not exist/i.test(upErr.message)) {
          return NextResponse.json(
            {
              error: "Run 20260904_listener_behavior_affinity.sql",
              code: "missing_columns",
            },
            { status: 503 },
          );
        }
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      if (!row) {
        return NextResponse.json({ error: "Play not found." }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        play_id: row.id,
        listened_secs: row.listened_secs,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data as { ok?: boolean; error?: string; play_id?: string; listened_secs?: number } | null;
  if (!row || row.ok === false) {
    return NextResponse.json(
      { error: row?.error || "Play not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    play_id: row.play_id,
    listened_secs: row.listened_secs,
  });
}
