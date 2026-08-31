import { getPublicSupabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("countries")
      .select("*")
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          status: "error",
          message: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: "ok",
      service: "RECT API",
      supabase: "connected",
      test: data,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Supabase not configured";
    return NextResponse.json(
      {
        status: "error",
        message,
        supabase: "not_configured",
      },
      { status: 503 },
    );
  }
}
