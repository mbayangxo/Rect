import { NextResponse } from "next/server";
import { notifyArtist } from "@/lib/dashboard/notifications";
import {
  sendArtistTip,
  TIP_AMOUNTS_XOF,
  TIP_MESSAGE_MAX,
} from "@/lib/dashboard/tips";
import { createClient } from "@/lib/supabase/server";

type Body = {
  artist_id?: string;
  amount_xof?: number;
  message?: string;
  track_id?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const artistId = body.artist_id?.trim();
  const amount = Number(body.amount_xof);
  const message =
    typeof body.message === "string" ? body.message.trim() : "";
  const trackId =
    typeof body.track_id === "string" ? body.track_id.trim() : "";

  if (!artistId) {
    return NextResponse.json(
      { error: "artist_id is required" },
      { status: 400 },
    );
  }
  if (!(TIP_AMOUNTS_XOF as readonly number[]).includes(amount)) {
    return NextResponse.json(
      { error: "Choose 100, 200, or 500 XOF", code: "invalid_amount" },
      { status: 400 },
    );
  }
  if (message.length > TIP_MESSAGE_MAX) {
    return NextResponse.json(
      { error: `Note must be ${TIP_MESSAGE_MAX} characters or fewer` },
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

  if (user.id === artistId) {
    return NextResponse.json(
      { error: "You can’t tip yourself", code: "cannot_tip_self" },
      { status: 400 },
    );
  }

  const result = await sendArtistTip(supabase, artistId, amount, {
    message: message || null,
    trackId: trackId || null,
  });
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "missing_table"
          ? 503
          : result.code === "cannot_tip_self" ||
              result.code === "invalid_amount"
            ? 400
            : result.code === "artist_not_found"
              ? 404
              : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  await notifyArtist(supabase, artistId, "tip", {
    amount_xof: result.amount_xof,
    body: result.message,
    track_id: result.track_id,
    tip_id: result.tip_id,
  });

  return NextResponse.json({
    ok: true,
    tip_id: result.tip_id,
    artist_id: result.artist_id,
    amount_xof: result.amount_xof,
    payment_method: result.payment_method,
    message: result.message,
    track_id: result.track_id,
  });
}
