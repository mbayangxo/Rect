import { NextResponse } from "next/server";
import {
  loadShareRecipients,
  sendPlaylistShare,
  sendTrackShare,
  SHARE_NOTE_MAX,
} from "@/lib/dashboard/shares";
import { createClient } from "@/lib/supabase/server";

type Body = {
  kind?: "track" | "playlist";
  id?: string;
  recipient_id?: string;
  note?: string;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in required", authenticated: false },
      { status: 401 },
    );
  }

  const result = await loadShareRecipients(supabase, user.id);
  if (result.missingTable) {
    return NextResponse.json(
      { error: "People follows not set up", code: "missing_table" },
      { status: 503 },
    );
  }
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    recipients: result.recipients,
    authenticated: true,
  });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = body.kind;
  const id = body.id?.trim();
  const recipientId = body.recipient_id?.trim();
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (kind !== "track" && kind !== "playlist") {
    return NextResponse.json(
      { error: "kind must be track or playlist" },
      { status: 400 },
    );
  }
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!recipientId) {
    return NextResponse.json(
      { error: "recipient_id is required" },
      { status: 400 },
    );
  }
  if (note.length > SHARE_NOTE_MAX) {
    return NextResponse.json(
      { error: `Note must be ${SHARE_NOTE_MAX} characters or fewer` },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in required", authenticated: false },
      { status: 401 },
    );
  }

  const result =
    kind === "track"
      ? await sendTrackShare(supabase, recipientId, id, note || null)
      : await sendPlaylistShare(supabase, recipientId, id, note || null);

  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "cannot_share_self" ||
              result.code === "not_following" ||
              result.code === "playlist_private"
            ? 400
            : result.code === "track_not_found" ||
                result.code === "playlist_not_found"
              ? 404
              : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    skipped: result.skipped ?? null,
    recipient_id: result.recipient_id,
    kind: result.kind,
  });
}
