import { NextResponse } from "next/server";
import {
  approvePlaylistCollabRequest,
  cancelPlaylistCollabAsk,
  declinePlaylistCollabRequest,
  invitePlaylistCollaborator,
  loadPlaylistCollaborators,
  removePlaylistCollaborator,
  requestPlaylistCollab,
  respondPlaylistCollab,
} from "@/lib/dashboard/playlist-collaborators";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };
type Body = {
  user_id?: string;
  action?:
    | "invite"
    | "accept"
    | "decline"
    | "remove"
    | "leave"
    | "request"
    | "approve_request"
    | "decline_request"
    | "cancel_request";
};

export async function GET(_request: Request, { params }: Params) {
  const { id: playlistId } = await params;
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

  const result = await loadPlaylistCollaborators(supabase, playlistId);
  if (result.missingTable) {
    return NextResponse.json(
      {
        error: "Run playlist collaborators SQL in Supabase first",
        code: "missing_table",
        collaborators: [],
      },
      { status: 503 },
    );
  }
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ collaborators: result.collaborators });
}

export async function POST(request: Request, { params }: Params) {
  const { id: playlistId } = await params;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action || "invite";
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

  if (action === "invite") {
    const userId = body.user_id?.trim();
    if (!userId) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 },
      );
    }
    const result = await invitePlaylistCollaborator(
      supabase,
      playlistId,
      userId,
    );
    if (!result.ok) {
      const status =
        result.code === "not_authenticated"
          ? 401
          : result.code === "missing_table"
            ? 503
            : result.code === "not_owner" ||
                result.code === "not_following" ||
                result.code === "playlist_not_found"
              ? 400
              : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      skipped: result.skipped ?? null,
    });
  }

  if (action === "accept" || action === "decline") {
    const result = await respondPlaylistCollab(
      supabase,
      playlistId,
      action === "accept",
    );
    if (!result.ok) {
      const status =
        result.code === "not_authenticated"
          ? 401
          : result.code === "missing_table"
            ? 503
            : result.code === "invite_not_found"
              ? 404
              : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      skipped: result.skipped ?? null,
    });
  }

  if (action === "request") {
    const result = await requestPlaylistCollab(supabase, playlistId);
    if (!result.ok) {
      const status =
        result.code === "not_authenticated"
          ? 401
          : result.code === "missing_table"
            ? 503
            : result.code === "not_following" ||
                result.code === "playlist_private" ||
                result.code === "blocked" ||
                result.code === "cannot_request_own"
              ? 400
              : result.code === "playlist_not_found"
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
    });
  }

  if (action === "approve_request" || action === "decline_request") {
    const userId = body.user_id?.trim();
    if (!userId) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 },
      );
    }
    const result =
      action === "approve_request"
        ? await approvePlaylistCollabRequest(supabase, playlistId, userId)
        : await declinePlaylistCollabRequest(supabase, playlistId, userId);
    if (!result.ok) {
      const status =
        result.code === "not_authenticated"
          ? 401
          : result.code === "missing_table"
            ? 503
            : result.code === "not_owner" || result.code === "no_request"
              ? 400
              : result.code === "playlist_not_found"
                ? 404
                : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      skipped: result.skipped ?? null,
    });
  }

  if (action === "cancel_request") {
    const result = await cancelPlaylistCollabAsk(supabase, playlistId);
    if (!result.ok) {
      const status =
        result.code === "not_authenticated"
          ? 401
          : result.code === "missing_table"
            ? 503
            : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      skipped: result.skipped ?? null,
    });
  }

  if (action === "remove" || action === "leave") {
    const target =
      action === "leave" ? undefined : body.user_id?.trim() || undefined;
    if (action === "remove" && !target) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 },
      );
    }
    const result = await removePlaylistCollaborator(
      supabase,
      playlistId,
      target,
    );
    if (!result.ok) {
      const status =
        result.code === "not_authenticated"
          ? 401
          : result.code === "missing_table"
            ? 503
            : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
