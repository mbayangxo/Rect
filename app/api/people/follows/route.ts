import { NextResponse } from "next/server";
import {
  loadPersonFollowRelation,
  togglePeopleFollow,
} from "@/lib/dashboard/people-follows";
import { notifyPeopleFollow } from "@/lib/dashboard/notifications";
import { createClient } from "@/lib/supabase/server";

type Body = { person_id?: string };

export async function GET(request: Request) {
  const personId = new URL(request.url).searchParams.get("person_id")?.trim();
  if (!personId) {
    return NextResponse.json(
      { error: "person_id is required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      following: false,
      follows_you: false,
      mutual: false,
      authenticated: false,
      person_id: personId,
      self: false,
    });
  }

  if (user.id === personId) {
    return NextResponse.json({
      following: false,
      follows_you: false,
      mutual: false,
      authenticated: true,
      person_id: personId,
      self: true,
    });
  }

  const result = await loadPersonFollowRelation(supabase, user.id, personId);
  if (result.missingTable) {
    return NextResponse.json(
      { error: "People follows not set up", code: "missing_table" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    following: result.following,
    follows_you: result.follows_you,
    mutual: result.mutual,
    authenticated: true,
    person_id: personId,
    self: false,
  });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const personId = body.person_id?.trim();
  if (!personId) {
    return NextResponse.json(
      { error: "person_id is required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Sign in required", authenticated: false },
      { status: 401 },
    );
  }

  if (user.id === personId) {
    return NextResponse.json(
      { error: "You can’t follow yourself", code: "cannot_follow_self" },
      { status: 400 },
    );
  }

  const result = await togglePeopleFollow(supabase, personId);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "cannot_follow_self" ||
              result.code === "profile_private" ||
              result.code === "person_not_found"
            ? 400
            : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  if (result.following) {
    await notifyPeopleFollow(supabase, personId);
  }

  const relation = await loadPersonFollowRelation(supabase, user.id, personId);

  return NextResponse.json({
    ok: true,
    following: result.following,
    follows_you: relation.follows_you,
    mutual: result.following && relation.follows_you,
    person_id: result.person_id,
    follower_count: result.follower_count,
  });
}
