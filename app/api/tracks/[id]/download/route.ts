import { NextResponse } from "next/server";
import { resolveTrackDownloadAccess } from "@/lib/dashboard/track-download-access";
import { createRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** Entitlement-checked download URL for offline save / file download. */
export async function GET(request: Request, { params }: Props) {
  const { id: trackId } = await params;

  const supabase = await createRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const access = await resolveTrackDownloadAccess(
    supabase,
    trackId,
    user?.id ?? null,
  );

  if (!access.ok) {
    const status =
      access.code === "not_found"
        ? 404
        : access.code === "not_authenticated"
          ? 401
          : access.code === "purchase_required"
            ? 402
            : 400;
    return NextResponse.json(
      { error: access.error, code: access.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    url: access.url,
    free: access.free,
  });
}
