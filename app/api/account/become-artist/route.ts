import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Same-account upgrade is retired. Artist OS is a separate login at /artist. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Artist OS is a separate login. Create an artist account at /artist/signup, then connect it from Profile if you want.",
      href: "/artist/signup",
    },
    { status: 410 },
  );
}
