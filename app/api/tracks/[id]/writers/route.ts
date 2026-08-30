import { NextResponse } from "next/server";
import {
  setTrackWriterSplits,
  type WriterSplitInput,
} from "@/lib/dashboard/writer-splits";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Artist replaces writer splits for their track (must total 100%). */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const trackId = id?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "Track id required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { writers?: unknown };
  try {
    body = (await request.json()) as { writers?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.writers)) {
    return NextResponse.json(
      { error: "Writer splits are required." },
      { status: 400 },
    );
  }

  const writers: WriterSplitInput[] = body.writers.map((item) => {
    const row = item as { name?: unknown; percent?: unknown };
    return {
      name: typeof row.name === "string" ? row.name : "",
      percent: Number(row.percent),
    };
  });

  const result = await setTrackWriterSplits(supabase, trackId, writers);
  if (!result.ok) {
    const status =
      result.code === "not_authenticated"
        ? 401
        : result.code === "not_owner"
          ? 403
          : result.code === "track_not_found"
            ? 404
            : result.code === "validation"
              ? 400
              : result.code === "missing_table"
                ? 503
                : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
