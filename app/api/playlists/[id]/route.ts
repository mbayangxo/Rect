import { NextResponse } from "next/server";
import { notifyFriendMixPublished } from "@/lib/dashboard/notifications";
import {
  deletePlaylist,
  renamePlaylist,
  setPlaylistDescription,
  setPlaylistPinned,
  setPlaylistPublic,
} from "@/lib/dashboard/playlists";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const playlistId = id?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
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

  let body: {
    name?: string;
    is_public?: boolean;
    description?: string | null;
    pinned?: boolean;
  };
  try {
    body = (await request.json()) as {
      name?: string;
      is_public?: boolean;
      description?: string | null;
      pinned?: boolean;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasName = typeof body.name === "string";
  const hasPublic = typeof body.is_public === "boolean";
  const hasDescription = "description" in body;
  const hasPinned = typeof body.pinned === "boolean";

  if (!hasName && !hasPublic && !hasDescription && !hasPinned) {
    return NextResponse.json(
      { error: "name, is_public, description, or pinned required" },
      { status: 400 },
    );
  }

  const out: {
    ok: true;
    name?: string;
    is_public?: boolean;
    became_public?: boolean;
    notified?: number;
    description?: string | null;
    pinned_at?: string | null;
  } = { ok: true };

  if (hasName) {
    const result = await renamePlaylist(
      supabase,
      user.id,
      playlistId,
      body.name!,
    );
    if (!result.ok) {
      const status =
        result.code === "missing_table"
          ? 503
          : result.code === "not_found"
            ? 404
            : result.error === "Name is required"
              ? 400
              : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    out.name = result.name;
  }

  if (hasDescription) {
    const raw =
      typeof body.description === "string" || body.description === null
        ? body.description
        : "";
    const result = await setPlaylistDescription(
      supabase,
      user.id,
      playlistId,
      raw,
    );
    if (!result.ok) {
      const status =
        result.code === "missing_table"
          ? 503
          : result.code === "not_found"
            ? 404
            : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    out.description = result.description;
  }

  if (hasPublic) {
    const result = await setPlaylistPublic(
      supabase,
      user.id,
      playlistId,
      body.is_public!,
    );
    if (!result.ok) {
      const status =
        result.code === "missing_table"
          ? 503
          : result.code === "not_found"
            ? 404
            : result.code === "cover_required"
              ? 400
              : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    out.is_public = result.is_public;
    out.became_public = result.became_public;
    if (result.became_public) {
      const notify = await notifyFriendMixPublished(supabase, playlistId);
      out.notified = notify.notified;
    }
  }

  if (hasPinned) {
    const result = await setPlaylistPinned(
      supabase,
      user.id,
      playlistId,
      body.pinned!,
    );
    if (!result.ok) {
      const status =
        result.code === "missing_table"
          ? 503
          : result.code === "not_found"
            ? 404
            : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status },
      );
    }
    out.pinned_at = result.pinned_at;
  }

  return NextResponse.json(out);
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const playlistId = id?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
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

  const result = await deletePlaylist(supabase, user.id, playlistId);
  if (!result.ok) {
    const status = result.code === "missing_table" ? 503 : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({ ok: true });
}
