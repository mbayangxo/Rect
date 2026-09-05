import { NextResponse } from "next/server";
import {
  createRectLabel,
  inviteLabelArtist,
  loadArtistLabelMemberships,
  loadLabelMemberships,
  loadOwnedLabel,
  respondLabelMembership,
} from "@/lib/dashboard/rect-labels";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const owned = await loadOwnedLabel(supabase, current.user.id);
  const asArtist = await loadArtistLabelMemberships(supabase, current.user.id);
  let roster: Awaited<ReturnType<typeof loadLabelMemberships>>["members"] = [];
  if (owned.label) {
    const m = await loadLabelMemberships(supabase, owned.label.id);
    roster = m.members;
  }

  return NextResponse.json({
    label: owned.label,
    missing_table: owned.missingTable || asArtist.missingTable,
    roster,
    my_memberships: asArtist.members,
  });
}

export async function POST(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: {
    action?: string;
    name?: string;
    artist_id?: string;
    membership_id?: string;
    accept?: boolean;
    split_pct?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action ?? "create";

  if (action === "create") {
    const name = (body.name ?? "").trim();
    if (name.length < 2) {
      return NextResponse.json({ error: "Label name required." }, { status: 400 });
    }
    const result = await createRectLabel(supabase, name);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, missing_table: result.missingTable },
        { status: result.missingTable ? 503 : 400 },
      );
    }
    return NextResponse.json({ ok: true, label_id: result.label_id });
  }

  if (action === "invite") {
    const owned = await loadOwnedLabel(supabase, current.user.id);
    if (!owned.label) {
      return NextResponse.json({ error: "Create a label first." }, { status: 400 });
    }
    const artistId = (body.artist_id ?? "").trim();
    if (!artistId) {
      return NextResponse.json({ error: "artist_id required." }, { status: 400 });
    }
    const result = await inviteLabelArtist(supabase, {
      labelId: owned.label.id,
      artistId,
      invitedBy: current.user.id,
      labelOwnerId: owned.label.owner_id,
      splitPct: body.split_pct,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, missing_table: result.missingTable },
        { status: result.missingTable ? 503 : 400 },
      );
    }
    return NextResponse.json({ ok: true, membership: result.membership });
  }

  if (action === "respond") {
    const membershipId = (body.membership_id ?? "").trim();
    if (!membershipId) {
      return NextResponse.json({ error: "membership_id required." }, { status: 400 });
    }
    const result = await respondLabelMembership(
      supabase,
      membershipId,
      current.user.id,
      body.accept !== false,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, membership: result.membership });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
