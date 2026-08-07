import { NextResponse } from "next/server";
import { getDashboardCurrentUser } from "@/lib/dashboard/current-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** CONNECTION 1 verification — returns raw Supabase auth + users query result. */
export async function GET() {
  try {
    const supabase = await createClient();
    const result = await getDashboardCurrentUser(supabase);

    if (!result.ok && result.reason === "no_session") {
      return NextResponse.json(
        {
          connection: 1,
          verified: false,
          authenticated: false,
          reason: result.reason,
          error: result.error,
        },
        { status: 401 },
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          connection: 1,
          verified: false,
          authenticated: !!result.user,
          reason: result.reason,
          error: result.error,
          profile_error: result.profileError,
          auth_user: result.user
            ? {
                id: result.user.id,
                email: result.user.email,
                metadata: result.user.user_metadata,
              }
            : null,
          query: result.query,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      connection: 1,
      verified: true,
      authenticated: true,
      displayName: result.displayName,
      query: result.query,
      supabase_result: {
        auth_user: {
          id: result.user.id,
          email: result.user.email,
          metadata: result.user.user_metadata,
        },
        users_row: result.profile,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        connection: 1,
        verified: false,
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
