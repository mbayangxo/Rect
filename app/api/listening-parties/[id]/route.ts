import { NextResponse } from "next/server";
import {
  endParty,
  joinParty,
  loadPartyById,
  loadPartyMessages,
  postPartyMessage,
  setPartyTrack,
} from "@/lib/dashboard/listening-parties";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createRouteClient(request);
  const partyRes = await loadPartyById(supabase, id);
  if (partyRes.missingTable) {
    return NextResponse.json(
      { error: "Run 20260903_listening_parties.sql", missing_table: true },
      { status: 503 },
    );
  }
  if (!partyRes.party) {
    return NextResponse.json({ error: "Party not found." }, { status: 404 });
  }
  const messages = await loadPartyMessages(supabase, id);
  return NextResponse.json({
    party: partyRes.party,
    messages: messages.messages,
  });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: {
    action?: string;
    body?: string;
    kind?: string;
    media_url?: string;
    track_id?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action ?? "join";

  if (action === "join") {
    const result = await joinParty(supabase, id, current.user.id);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, missing_table: result.missingTable },
        { status: result.missingTable ? 503 : 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "message") {
    const kind =
      body.kind === "gif" || body.kind === "photo" ? body.kind : "text";
    const result = await postPartyMessage(
      supabase,
      id,
      current.user.id,
      body.body ?? "",
      kind,
      body.media_url ?? null,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "set_track") {
    const trackId =
      typeof body.track_id === "string" ? body.track_id.trim() : "";
    if (!trackId) {
      return NextResponse.json({ error: "track_id required." }, { status: 400 });
    }
    const result = await setPartyTrack(
      supabase,
      id,
      current.user.id,
      trackId,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "end") {
    const partyRes = await loadPartyById(supabase, id);
    if (!partyRes.party || partyRes.party.host_id !== current.user.id) {
      return NextResponse.json({ error: "Only the host can end." }, { status: 403 });
    }
    const result = await endParty(supabase, id, current.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
