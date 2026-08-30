import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { getArtists, getSettings } from "@/lib/catalog";

export async function GET() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    const [settings, artists] = await Promise.all([getSettings(), getArtists()]);
    return NextResponse.json({
      ok: true,
      site: settings.name,
      artists: artists.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database unavailable";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
