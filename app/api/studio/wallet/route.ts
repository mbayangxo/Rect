import { NextResponse } from "next/server";
import { isArtistAccount } from "@/lib/dashboard/artist-access";
import {
  loadArtistWallet,
  requestArtistPayout,
} from "@/lib/dashboard/artist-wallet";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  const wallet = await loadArtistWallet(supabase, current.user.id);
  return NextResponse.json(wallet);
}

type PayoutBody = { amount_xof?: number; payout_phone?: string };

export async function POST(request: Request) {
  const supabase = await createRouteClient(request);
  const current = await getDashboardCurrentUser(supabase);
  if (!current.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isArtistAccount(current.profile, current.user)) {
    return NextResponse.json({ error: "Artist account required." }, { status: 403 });
  }

  let body: PayoutBody;
  try {
    body = (await request.json()) as PayoutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = Number(body.amount_xof);
  const phone = (body.payout_phone ?? "").trim();
  if (!Number.isFinite(amount) || amount < 500) {
    return NextResponse.json(
      { error: "Minimum payout is 500 XOF." },
      { status: 400 },
    );
  }
  if (phone.length < 8) {
    return NextResponse.json(
      { error: "Enter your JOKO mobile money number." },
      { status: 400 },
    );
  }

  const result = await requestArtistPayout(supabase, amount, phone);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const wallet = await loadArtistWallet(supabase, current.user.id);
  return NextResponse.json({
    ok: true,
    payout_id: result.payoutId,
    scheduled_for: result.scheduledFor,
    wallet,
  });
}
